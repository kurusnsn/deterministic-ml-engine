"""
S3-compatible object storage for large report payloads.
"""

from dataclasses import dataclass
import json
import logging
import os
import time
from typing import Any, Dict, Optional, Tuple

import aioboto3
from botocore.config import Config
from botocore.exceptions import ClientError

from ..observability import get_tracer, record_s3_operation

logger = logging.getLogger(__name__)


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.lower() in ("1", "true", "yes", "on")


@dataclass(frozen=True)
class S3Config:
    bucket: str
    endpoint: str
    region: str
    access_key_id: str
    secret_access_key: str
    prefix: str
    force_path_style: bool


class ReportObjectStore:
    """S3-compatible storage for saved report payloads."""

    def __init__(self) -> None:
        self.backend = os.getenv("REPORT_STORAGE_BACKEND", "db").lower()
        self._config: Optional[S3Config] = None
        if self.backend == "s3":
            self._config = self._load_config()

    @property
    def enabled(self) -> bool:
        return self.backend == "s3"

    def _load_config(self) -> S3Config:
        bucket = os.getenv("S3_BUCKET", "").strip()
        endpoint = os.getenv("S3_ENDPOINT", "").strip()
        access_key_id = os.getenv("S3_ACCESS_KEY_ID", "").strip()
        secret_access_key = os.getenv("S3_SECRET_ACCESS_KEY", "").strip()
        region = os.getenv("S3_REGION", "us-east-1").strip() or "us-east-1"
        prefix = os.getenv("S3_PREFIX", "").strip().strip("/")
        force_path_style = _env_bool("S3_FORCE_PATH_STYLE", True)

        missing = []
        if not bucket:
            missing.append("S3_BUCKET")
        if not endpoint:
            missing.append("S3_ENDPOINT")
        if not access_key_id:
            missing.append("S3_ACCESS_KEY_ID")
        if not secret_access_key:
            missing.append("S3_SECRET_ACCESS_KEY")

        if missing:
            raise RuntimeError(f"Missing S3 config: {', '.join(missing)}")

        return S3Config(
            bucket=bucket,
            endpoint=endpoint,
            region=region,
            access_key_id=access_key_id,
            secret_access_key=secret_access_key,
            prefix=prefix,
            force_path_style=force_path_style,
        )

    def _require_config(self) -> S3Config:
        if not self._config:
            raise RuntimeError("S3 backend enabled but config is missing")
        return self._config

    def _build_key(self, report_id: str) -> str:
        base_key = f"reports/{report_id}.json"
        config = self._require_config()
        if config.prefix:
            return f"{config.prefix}/{base_key}"
        return base_key

    def _client(self):
        config = self._require_config()
        session = aioboto3.Session()
        botocore_config = Config(
            signature_version="s3v4",
            s3={
                "addressing_style": "path" if config.force_path_style else "virtual",
            },
        )
        return session.client(
            "s3",
            endpoint_url=config.endpoint,
            region_name=config.region,
            aws_access_key_id=config.access_key_id,
            aws_secret_access_key=config.secret_access_key,
            config=botocore_config,
        )

    async def put_report(self, report_id: str, report_payload: str) -> Tuple[str, int]:
        config = self._require_config()
        key = self._build_key(report_id)
        body = report_payload.encode("utf-8")
        payload_size = len(body)

        tracer = get_tracer()
        start = time.perf_counter()
        status = "success"

        with tracer.start_as_current_span("s3.put_report") as span:
            span.set_attribute("s3.bucket", config.bucket)
            span.set_attribute("s3.key", key)
            span.set_attribute("s3.payload_bytes", payload_size)

            try:
                async with self._client() as s3:
                    await s3.put_object(
                        Bucket=config.bucket,
                        Key=key,
                        Body=body,
                        ContentType="application/json",
                    )
            except ClientError as exc:
                status = "error"
                span.set_attribute("error", True)
                span.set_attribute("error.message", str(exc))
                logger.error("S3 put_object failed for %s: %s", key, exc)
                raise
            finally:
                duration_ms = (time.perf_counter() - start) * 1000
                record_s3_operation(
                    operation="put_object",
                    status=status,
                    duration_ms=duration_ms,
                    payload_bytes=payload_size,
                    bucket=config.bucket,
                )
                span.set_attribute("duration_ms", duration_ms)

        return key, payload_size

    async def get_report(self, key: str) -> Dict[str, Any]:
        config = self._require_config()
        tracer = get_tracer()
        start = time.perf_counter()
        status = "success"
        payload_size = 0

        with tracer.start_as_current_span("s3.get_report") as span:
            span.set_attribute("s3.bucket", config.bucket)
            span.set_attribute("s3.key", key)

            try:
                async with self._client() as s3:
                    response = await s3.get_object(Bucket=config.bucket, Key=key)
                    raw = await response["Body"].read()
                    payload_size = len(raw)
                    span.set_attribute("s3.payload_bytes", payload_size)
                    return json.loads(raw)
            except ClientError as exc:
                status = "error"
                span.set_attribute("error", True)
                span.set_attribute("error.message", str(exc))
                logger.error("S3 get_object failed for %s: %s", key, exc)
                raise
            finally:
                duration_ms = (time.perf_counter() - start) * 1000
                record_s3_operation(
                    operation="get_object",
                    status=status,
                    duration_ms=duration_ms,
                    payload_bytes=payload_size,
                    bucket=config.bucket,
                )
                span.set_attribute("duration_ms", duration_ms)

    async def delete_report(self, key: str) -> None:
        config = self._require_config()
        tracer = get_tracer()
        start = time.perf_counter()
        status = "success"

        with tracer.start_as_current_span("s3.delete_report") as span:
            span.set_attribute("s3.bucket", config.bucket)
            span.set_attribute("s3.key", key)

            try:
                async with self._client() as s3:
                    await s3.delete_object(Bucket=config.bucket, Key=key)
            except ClientError as exc:
                status = "error"
                span.set_attribute("error", True)
                span.set_attribute("error.message", str(exc))
                logger.warning("S3 delete_object failed for %s: %s", key, exc)
            finally:
                duration_ms = (time.perf_counter() - start) * 1000
                record_s3_operation(
                    operation="delete_object",
                    status=status,
                    duration_ms=duration_ms,
                    bucket=config.bucket,
                )
                span.set_attribute("duration_ms", duration_ms)


_report_store: Optional[ReportObjectStore] = None


def get_report_object_store() -> ReportObjectStore:
    global _report_store
    if _report_store is None:
        _report_store = ReportObjectStore()
    return _report_store

