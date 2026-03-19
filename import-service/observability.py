import asyncio
import contextvars
import json
import logging
import os
import time
import uuid
import weakref
from dataclasses import dataclass
from typing import Any, Dict, Optional

from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.requests import RequestsInstrumentor
from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor
from opentelemetry.instrumentation.redis import RedisInstrumentor
from opentelemetry.instrumentation.system_metrics import SystemMetricsInstrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
from opentelemetry.sdk._logs.export import BatchLogRecordProcessor
from opentelemetry.metrics import Observation


_request_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("request_id", default=None)
_route_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("route", default=None)
_domain_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("domain", default=None)
_user_id_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("user_id", default=None)


def _parse_resource_attributes(raw: Optional[str]) -> Dict[str, str]:
    if not raw:
        return {}
    attributes: Dict[str, str] = {}
    for entry in raw.split(","):
        if "=" not in entry:
            continue
        key, value = entry.split("=", 1)
        key = key.strip()
        value = value.strip()
        if key and value:
            attributes[key] = value
    return attributes


def _get_environment() -> str:
    return (
        os.getenv("DEPLOYMENT_ENV")
        or os.getenv("ENVIRONMENT")
        or os.getenv("ENV")
        or "development"
    )


def _get_trace_id() -> Optional[str]:
    span = trace.get_current_span()
    if not span:
        return None
    context = span.get_span_context()
    if not context or not context.trace_id:
        return None
    return format(context.trace_id, "032x")


class JsonFormatter(logging.Formatter):
    def __init__(self, service_name: str) -> None:
        super().__init__()
        self._service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        message = record.getMessage()
        payload: Dict[str, Any] = {
            "level": record.levelname.lower(),
            "service": self._service_name,
            "domain": getattr(record, "domain", None) or _domain_var.get() or "general",
            "route": getattr(record, "route", None) or _route_var.get() or "unknown",
            "trace_id": _get_trace_id(),
            "request_id": _request_id_var.get(),
            "message": message,
        }

        user_id = getattr(record, "user_id", None) or _user_id_var.get()
        if user_id:
            payload["user_id"] = user_id

        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=True)


@dataclass
class GaugeState:
    name: str
    description: str
    unit: str
    value: float = 0.0

    def set(self, value: float) -> None:
        self.value = float(value)

    def observe(self) -> Observation:
        return Observation(self.value, attributes=_base_metric_attributes())


def _base_metric_attributes() -> Dict[str, str]:
    return {
        "service": _service_name,
        "environment": _get_environment(),
    }


@dataclass
class MetricsRegistry:
    http_request_duration_ms: Any
    http_requests_total: Any
    external_api_duration_ms: Any
    gpu_queue_wait_ms: Any
    db_pool_wait_ms: Any
    redis_pool_wait_ms: Any
    llm_tokens_total: Any
    llm_tokens_unknown_total: Any
    gpu_jobs_total: Any
    analysis_requests_total: Any
    nodejs_eventloop_lag_seconds: GaugeState
    db_pool_in_use: GaugeState
    redis_connections_in_use: GaugeState
    gpu_slots_in_use: GaugeState


_metrics: Optional[MetricsRegistry] = None
_tracer = None
_meter = None
_service_name = os.getenv("OTEL_SERVICE_NAME", "gateway")
_event_loop_monitor_started = False
_pool_in_use_counts = weakref.WeakKeyDictionary()
_pool_in_use_by_id: Dict[int, int] = {}


def init_observability(service_name: str) -> None:
    global _tracer, _meter, _metrics, _service_name

    _service_name = os.getenv("OTEL_SERVICE_NAME", service_name)
    resource_attributes = _parse_resource_attributes(os.getenv("OTEL_RESOURCE_ATTRIBUTES"))
    resource_attributes.setdefault("service.name", _service_name)
    resource_attributes.setdefault("deployment.environment", _get_environment())
    resource = Resource.create(resource_attributes)

    # Determine if OTEL exports should be enabled (staging/production only)
    environment = _get_environment().lower()
    otel_enabled = environment in ("staging", "production", "prod")
    
    # Allow explicit override via environment variable
    if os.getenv("OTEL_SDK_DISABLED", "").lower() in ("1", "true", "yes", "on"):
        otel_enabled = False

    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://otel-collector.monitoring.svc.cluster.local:4317")
    insecure = os.getenv("OTEL_EXPORTER_OTLP_INSECURE", "true").lower() in ("1", "true", "yes", "on")

    # Setup tracing (with or without OTEL export)
    tracer_provider = TracerProvider(resource=resource)
    if otel_enabled:
        tracer_provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, insecure=insecure)))
    trace.set_tracer_provider(tracer_provider)

    # Setup metrics (with or without OTEL export)
    if otel_enabled:
        metric_reader = PeriodicExportingMetricReader(
            OTLPMetricExporter(endpoint=endpoint, insecure=insecure)
        )
        meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
    else:
        meter_provider = MeterProvider(resource=resource)
    metrics.set_meter_provider(meter_provider)

    # Setup logging (with or without OTEL export)
    root_logger = logging.getLogger()
    root_logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())

    json_handler = logging.StreamHandler()
    json_handler.setFormatter(JsonFormatter(service_name))
    
    if otel_enabled:
        logger_provider = LoggerProvider(resource=resource)
        logger_provider.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter(endpoint=endpoint, insecure=insecure)))
        logging_handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
        root_logger.handlers = [json_handler, logging_handler]
    else:
        root_logger.handlers = [json_handler]

    _tracer = trace.get_tracer(service_name)
    _meter = metrics.get_meter(service_name)

    _metrics = MetricsRegistry(
        http_request_duration_ms=_meter.create_histogram(
            "http_request_duration_ms",
            description="HTTP request duration",
            unit="ms",
        ),
        http_requests_total=_meter.create_counter(
            "http_requests_total",
            description="Total HTTP requests",
        ),
        external_api_duration_ms=_meter.create_histogram(
            "external_api_duration_ms",
            description="External API duration",
            unit="ms",
        ),
        gpu_queue_wait_ms=_meter.create_histogram(
            "gpu_queue_wait_ms",
            description="GPU queue wait time",
            unit="ms",
        ),
        db_pool_wait_ms=_meter.create_histogram(
            "db_pool_wait_ms",
            description="Database pool wait time",
            unit="ms",
        ),
        redis_pool_wait_ms=_meter.create_histogram(
            "redis_pool_wait_ms",
            description="Redis pool wait time",
            unit="ms",
        ),
        llm_tokens_total=_meter.create_counter(
            "llm_tokens_total",
            description="LLM tokens used",
        ),
        llm_tokens_unknown_total=_meter.create_counter(
            "llm_tokens_unknown_total",
            description="LLM responses without token counts",
        ),
        gpu_jobs_total=_meter.create_counter(
            "gpu_jobs_total",
            description="GPU jobs started",
        ),
        analysis_requests_total=_meter.create_counter(
            "analysis_requests_total",
            description="Analysis requests handled",
        ),
        nodejs_eventloop_lag_seconds=GaugeState(
            name="nodejs_eventloop_lag_seconds",
            description="Event loop lag in seconds",
            unit="s",
        ),
        db_pool_in_use=GaugeState(
            name="db_pool_in_use",
            description="Database pool connections in use",
            unit="connections",
        ),
        redis_connections_in_use=GaugeState(
            name="redis_connections_in_use",
            description="Redis connections in use",
            unit="connections",
        ),
        gpu_slots_in_use=GaugeState(
            name="gpu_slots_in_use",
            description="GPU slots in use",
            unit="slots",
        ),
    )

    _meter.create_observable_gauge(
        _metrics.nodejs_eventloop_lag_seconds.name,
        callbacks=[lambda options: [_metrics.nodejs_eventloop_lag_seconds.observe()]],
        description=_metrics.nodejs_eventloop_lag_seconds.description,
        unit=_metrics.nodejs_eventloop_lag_seconds.unit,
    )
    _meter.create_observable_gauge(
        _metrics.db_pool_in_use.name,
        callbacks=[lambda options: [_metrics.db_pool_in_use.observe()]],
        description=_metrics.db_pool_in_use.description,
        unit=_metrics.db_pool_in_use.unit,
    )
    _meter.create_observable_gauge(
        _metrics.redis_connections_in_use.name,
        callbacks=[lambda options: [_metrics.redis_connections_in_use.observe()]],
        description=_metrics.redis_connections_in_use.description,
        unit=_metrics.redis_connections_in_use.unit,
    )
    _meter.create_observable_gauge(
        _metrics.gpu_slots_in_use.name,
        callbacks=[lambda options: [_metrics.gpu_slots_in_use.observe()]],
        description=_metrics.gpu_slots_in_use.description,
        unit=_metrics.gpu_slots_in_use.unit,
    )

    HTTPXClientInstrumentor().instrument()
    RequestsInstrumentor().instrument()
    AsyncPGInstrumentor().instrument()
    RedisInstrumentor().instrument()
    SystemMetricsInstrumentor().instrument()
    instrument_redis_pool_wait()


def instrument_fastapi(app) -> None:
    FastAPIInstrumentor.instrument_app(app)


def get_tracer():
    if _tracer is None:
        return trace.get_tracer("gateway")
    return _tracer


def get_meter():
    if _meter is None:
        return metrics.get_meter("gateway")
    return _meter


def get_metrics() -> MetricsRegistry:
    if _metrics is None:
        raise RuntimeError("Observability not initialized")
    return _metrics


def set_request_context(route: Optional[str], request_id: Optional[str], domain: Optional[str]) -> None:
    if request_id is None:
        request_id = str(uuid.uuid4())
    _request_id_var.set(request_id)
    if route:
        _route_var.set(route)
    if domain:
        _domain_var.set(domain)


def clear_request_context() -> None:
    _request_id_var.set(None)
    _route_var.set(None)
    _domain_var.set(None)
    _user_id_var.set(None)


def set_user_id(user_id: Optional[str]) -> None:
    if user_id:
        _user_id_var.set(user_id)


async def start_event_loop_lag_monitor(interval_seconds: float = 0.5) -> None:
    global _event_loop_monitor_started
    if _event_loop_monitor_started:
        return
    _event_loop_monitor_started = True
    metrics_registry = get_metrics()

    async def _monitor() -> None:
        loop = asyncio.get_running_loop()
        target = loop.time() + interval_seconds
        while True:
            await asyncio.sleep(interval_seconds)
            now = loop.time()
            lag = max(0.0, now - target)
            metrics_registry.nodejs_eventloop_lag_seconds.set(lag)
            target = now + interval_seconds

    asyncio.create_task(_monitor())


def record_http_metrics(route: str, method: str, status_code: int, duration_ms: float) -> None:
    registry = get_metrics()
    attributes = {
        "route": route,
        "method": method,
        "status": str(status_code),
        **_base_metric_attributes(),
    }
    registry.http_requests_total.add(1, attributes)
    registry.http_request_duration_ms.record(duration_ms, attributes)


def record_external_api_duration(provider: str, duration_ms: float) -> None:
    registry = get_metrics()
    registry.external_api_duration_ms.record(
        duration_ms,
        {
            "provider": provider,
            **_base_metric_attributes(),
        },
    )


def record_db_pool_wait(duration_ms: float) -> None:
    registry = get_metrics()
    registry.db_pool_wait_ms.record(duration_ms, _base_metric_attributes())


def record_redis_pool_wait(duration_ms: float) -> None:
    registry = get_metrics()
    registry.redis_pool_wait_ms.record(duration_ms, _base_metric_attributes())


def increment_analysis_requests(route: str) -> None:
    registry = get_metrics()
    registry.analysis_requests_total.add(1, {**_base_metric_attributes(), "route": route})


def increment_gpu_jobs(provider: str) -> None:
    registry = get_metrics()
    registry.gpu_jobs_total.add(1, {**_base_metric_attributes(), "provider": provider})


def record_gpu_queue_wait(duration_ms: float) -> None:
    registry = get_metrics()
    registry.gpu_queue_wait_ms.record(duration_ms, _base_metric_attributes())


def set_gpu_slots_in_use(count: int) -> None:
    registry = get_metrics()
    registry.gpu_slots_in_use.set(float(count))


def record_llm_tokens(provider: str, model: str, tokens: Optional[int]) -> None:
    registry = get_metrics()
    attributes = {**_base_metric_attributes(), "provider": provider, "model": model}
    if tokens is None:
        registry.llm_tokens_unknown_total.add(1, attributes)
    else:
        registry.llm_tokens_total.add(tokens, attributes)


def instrument_asyncpg_pool(pool) -> None:
    registry = get_metrics()

    def _get_pool_count(target):
        try:
            return _pool_in_use_counts.get(target, 0)
        except TypeError:
            return _pool_in_use_by_id.get(id(target), 0)

    def _set_pool_count(target, value: int) -> None:
        try:
            _pool_in_use_counts[target] = value
        except TypeError:
            _pool_in_use_by_id[id(target)] = value

    pool_class = pool.__class__
    if hasattr(pool_class, "_otel_acquire_wrapped"):
        return

    original_acquire = pool_class.acquire

    class _AcquireContextWrapper:
        def __init__(self, context_manager, pool_ref):
            self._context_manager = context_manager
            self._pool_ref = pool_ref

        async def __aenter__(self):
            start = time.perf_counter()
            with get_tracer().start_as_current_span("db.pool.wait") as span:
                conn = await self._context_manager.__aenter__()
                duration_ms = (time.perf_counter() - start) * 1000
                record_db_pool_wait(duration_ms)
                span.set_attribute("db.system", "postgresql")
                span.set_attribute("wait.ms", duration_ms)
            in_use = _get_pool_count(self._pool_ref) + 1
            _set_pool_count(self._pool_ref, in_use)
            registry.db_pool_in_use.set(in_use)
            return conn

        async def __aexit__(self, exc_type, exc, tb):
            try:
                return await self._context_manager.__aexit__(exc_type, exc, tb)
            finally:
                in_use = max(0, _get_pool_count(self._pool_ref) - 1)
                _set_pool_count(self._pool_ref, in_use)
                registry.db_pool_in_use.set(in_use)

    def _acquire(self, *args, **kwargs):
        return _AcquireContextWrapper(original_acquire(self, *args, **kwargs), self)

    pool_class.acquire = _acquire
    pool_class._otel_acquire_wrapped = True


def instrument_redis_pool_wait() -> None:
    try:
        import redis
        from redis import asyncio as redis_asyncio
    except Exception:
        return

    tracer = get_tracer()
    registry = get_metrics()

    if hasattr(redis.connection.ConnectionPool, "_otel_wrapped"):
        return

    original_get_connection = redis.connection.ConnectionPool.get_connection

    def _sync_get_connection(self, command_name, *args, **kwargs):
        start = time.perf_counter()
        with tracer.start_as_current_span("redis.pool.wait") as span:
            conn = original_get_connection(self, command_name, *args, **kwargs)
            duration_ms = (time.perf_counter() - start) * 1000
            record_redis_pool_wait(duration_ms)
            span.set_attribute("db.system", "redis")
            span.set_attribute("db.operation", command_name)
            span.set_attribute("wait.ms", duration_ms)
        in_use = getattr(self, "_in_use_connections", None)
        if isinstance(in_use, (set, list)):
            registry.redis_connections_in_use.set(len(in_use))
        return conn

    redis.connection.ConnectionPool.get_connection = _sync_get_connection
    redis.connection.ConnectionPool._otel_wrapped = True

    if hasattr(redis_asyncio, "connection"):
        async_pool = redis_asyncio.connection.ConnectionPool
        if not hasattr(async_pool, "_otel_wrapped"):
            original_async_get = async_pool.get_connection

            async def _async_get_connection(self, command_name, *args, **kwargs):
                start = time.perf_counter()
                with tracer.start_as_current_span("redis.pool.wait") as span:
                    conn = await original_async_get(self, command_name, *args, **kwargs)
                    duration_ms = (time.perf_counter() - start) * 1000
                    record_redis_pool_wait(duration_ms)
                    span.set_attribute("db.system", "redis")
                    span.set_attribute("db.operation", command_name)
                    span.set_attribute("wait.ms", duration_ms)
                in_use = getattr(self, "_in_use_connections", None)
                if isinstance(in_use, (set, list)):
                    registry.redis_connections_in_use.set(len(in_use))
                return conn

            async_pool.get_connection = _async_get_connection
            async_pool._otel_wrapped = True
