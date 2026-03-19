#!/usr/bin/env python3
import argparse
import asyncio
import json
import math
import statistics
import time
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import httpx


@dataclass
class EndpointConfig:
    name: str
    method: str
    path: str
    params: Optional[Dict[str, Any]] = None
    json_body: Optional[Dict[str, Any]] = None


def percentile(values: List[float], pct: float) -> float:
    if not values:
        return 0.0
    k = max(0, min(len(values) - 1, int(math.ceil(pct * len(values))) - 1))
    return sorted(values)[k]


def load_config(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def apply_overrides(config: Dict[str, Any]) -> None:
    base_url = os.getenv("PERF_BASE_URL")
    if base_url:
        config["base_url"] = base_url

    report_id = os.getenv("PERF_REPORT_ID")
    captcha_token = os.getenv("PERF_CAPTCHA_TOKEN")

    unresolved = []
    for endpoint in config.get("endpoints", []):
        path = endpoint.get("path", "")
        if "REPLACE_ME" in path:
            if report_id:
                endpoint["path"] = path.replace("REPLACE_ME", report_id)
            else:
                unresolved.append(f"{endpoint.get('name', 'unknown')}.path")

        body = endpoint.get("json_body") or {}
        if isinstance(body, dict):
            if body.get("token") == "REPLACE_ME":
                if captcha_token:
                    body["token"] = captcha_token
                else:
                    unresolved.append(f"{endpoint.get('name', 'unknown')}.json_body.token")

    if unresolved:
        missing = ", ".join(sorted(set(unresolved)))
        raise SystemExit(f"Missing PERF_REPORT_ID or PERF_CAPTCHA_TOKEN for placeholders: {missing}")


async def run_request(
    client: httpx.AsyncClient,
    base_url: str,
    endpoint: EndpointConfig,
    results: Dict[str, Dict[str, Any]],
) -> None:
    url = base_url.rstrip("/") + endpoint.path
    start = time.perf_counter()
    error = None
    status = 0
    try:
        response = await client.request(
            endpoint.method,
            url,
            params=endpoint.params,
            json=endpoint.json_body,
        )
        status = response.status_code
        if status >= 400:
            error = f"HTTP {status}"
    except Exception as exc:
        error = str(exc)
    duration_ms = (time.perf_counter() - start) * 1000

    entry = results.setdefault(endpoint.name, {"latencies_ms": [], "errors": 0, "total": 0})
    entry["latencies_ms"].append(duration_ms)
    entry["total"] += 1
    if error:
        entry["errors"] += 1


async def run_load(config: Dict[str, Any]) -> Dict[str, Any]:
    base_url = config["base_url"]
    rps = int(config.get("rps", 5))
    duration_seconds = int(config.get("duration_seconds", 30))
    endpoints = [EndpointConfig(**entry) for entry in config["endpoints"]]

    results: Dict[str, Dict[str, Any]] = {}
    total_requests = rps * duration_seconds
    interval = 1.0 / max(1, rps)

    async with httpx.AsyncClient(timeout=config.get("timeout_seconds", 30)) as client:
        tasks = []
        for i in range(total_requests):
            endpoint = endpoints[i % len(endpoints)]
            tasks.append(asyncio.create_task(run_request(client, base_url, endpoint, results)))
            await asyncio.sleep(interval)
        await asyncio.gather(*tasks)

    summary = {
        "base_url": base_url,
        "rps": rps,
        "duration_seconds": duration_seconds,
        "endpoints": {},
    }

    for name, data in results.items():
        latencies = data["latencies_ms"]
        total = data["total"]
        errors = data["errors"]
        summary["endpoints"][name] = {
            "count": total,
            "error_rate": errors / total if total else 0.0,
            "p50_ms": percentile(latencies, 0.50),
            "p95_ms": percentile(latencies, 0.95),
            "p99_ms": percentile(latencies, 0.99),
        }

    return summary


def compare_against_baseline(summary: Dict[str, Any], baseline: Dict[str, Any]) -> List[str]:
    failures = []
    for name, metrics in summary["endpoints"].items():
        base = baseline["endpoints"].get(name)
        if not base:
            failures.append(f"Missing baseline for endpoint {name}")
            continue
        if metrics["p95_ms"] > base["p95_ms"] * 1.10:
            failures.append(f"{name} p95 regression: {metrics['p95_ms']:.2f}ms > {base['p95_ms']:.2f}ms")
        if metrics["error_rate"] > base["error_rate"]:
            failures.append(f"{name} error rate regression: {metrics['error_rate']:.4f} > {base['error_rate']:.4f}")

    summary_infra = summary.get("infra") or {}
    baseline_infra = baseline.get("infra") or {}
    for key, value in summary_infra.items():
        base_value = baseline_infra.get(key)
        if base_value is None:
            failures.append(f"Missing baseline for infra metric {key}")
            continue
        if base_value == 0:
            if value > 0:
                failures.append(f"{key} regression: {value:.6f} > {base_value:.6f}")
            continue
        if value > base_value * 1.10:
            failures.append(f"{key} regression: {value:.6f} > {base_value:.6f}")
    return failures


def _query_prometheus(prom_url: str, query: str, timestamp: float) -> float:
    response = httpx.get(
        f"{prom_url.rstrip('/')}/api/v1/query",
        params={"query": query, "time": timestamp},
        timeout=10.0,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("status") != "success":
        raise RuntimeError(f"Prometheus query failed: {payload}")
    results = payload.get("data", {}).get("result", [])
    if not results:
        return 0.0
    value = results[0].get("value", [None, "0"])[1]
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _collect_infra_metrics(duration_seconds: int) -> Dict[str, float]:
    prom_url = os.getenv("PROMETHEUS_URL")
    if not prom_url:
        return {}

    env_label = os.getenv("PROMETHEUS_ENV", "staging")
    window = f"{max(1, duration_seconds)}s"
    end_time = time.time()

    metrics = {}
    metrics["event_loop_lag_max"] = _query_prometheus(
        prom_url,
        f"max_over_time(nodejs_eventloop_lag_seconds{{environment=\"{env_label}\"}}[{window}])",
        end_time,
    )
    metrics["db_pool_wait_p95"] = _query_prometheus(
        prom_url,
        f"histogram_quantile(0.95, sum(rate(db_pool_wait_ms_bucket{{environment=\"{env_label}\"}}[1m])) by (le))",
        end_time,
    )
    metrics["redis_pool_wait_p95"] = _query_prometheus(
        prom_url,
        f"histogram_quantile(0.95, sum(rate(redis_pool_wait_ms_bucket{{environment=\"{env_label}\"}}[1m])) by (le))",
        end_time,
    )
    metrics["gpu_queue_wait_p95"] = _query_prometheus(
        prom_url,
        f"histogram_quantile(0.95, sum(rate(gpu_queue_wait_ms_bucket{{environment=\"{env_label}\"}}[1m])) by (le))",
        end_time,
    )

    gpu_jobs = _query_prometheus(
        prom_url,
        f"increase(gpu_jobs_total{{environment=\"{env_label}\"}}[{window}])",
        end_time,
    )
    analysis_requests = _query_prometheus(
        prom_url,
        f"increase(analysis_requests_total{{environment=\"{env_label}\"}}[{window}])",
        end_time,
    )
    metrics["gpu_jobs_per_request"] = (gpu_jobs / analysis_requests) if analysis_requests else 0.0

    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Performance smoke test runner")
    parser.add_argument("--config", default="scripts/perf_smoke_config.json")
    parser.add_argument("--baseline", default="perf/baseline.json")
    parser.add_argument("--write-baseline", action="store_true")
    args = parser.parse_args()

    config = load_config(args.config)
    apply_overrides(config)
    summary = asyncio.run(run_load(config))
    summary["infra"] = _collect_infra_metrics(int(summary.get("duration_seconds", 0)))

    if args.write_baseline:
        with open(args.baseline, "w", encoding="utf-8") as handle:
            json.dump(summary, handle, indent=2)
        print(f"Baseline written to {args.baseline}")
        return

    try:
        with open(args.baseline, "r", encoding="utf-8") as handle:
            baseline = json.load(handle)
    except FileNotFoundError:
        raise SystemExit(f"Baseline file missing: {args.baseline}")

    failures = compare_against_baseline(summary, baseline)
    if failures:
        for failure in failures:
            print(f"FAIL: {failure}")
        raise SystemExit(1)

    print("Performance smoke test passed")


if __name__ == "__main__":
    main()
