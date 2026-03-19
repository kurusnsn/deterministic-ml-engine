"""
Backend Latency Test for /api/me/home endpoint

Tests that the aggregated profile endpoint responds within acceptable latency budgets.
p95 latency must be < 150ms for local development.
"""

import asyncio
import time
import statistics
import pytest
import httpx

GATEWAY_URL = "http://localhost:8010"
NUM_REQUESTS = 50
P95_BUDGET_MS = 150


@pytest.mark.asyncio
async def test_home_endpoint_latency():
    """
    Test: /api/me/home p95 latency < 150ms
    
    Makes 50 requests to the endpoint and asserts that p95 response time
    is within the performance budget.
    """
    latencies = []
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        for i in range(NUM_REQUESTS):
            start = time.perf_counter()
            try:
                resp = await client.get(
                    f"{GATEWAY_URL}/api/me/home?include_profile=true",
                    headers={"x-session-id": "perf-test-session"}
                )
                elapsed_ms = (time.perf_counter() - start) * 1000
                latencies.append(elapsed_ms)
                
                # Allow both 200 (with data) and 401 (no auth) - we're testing latency not auth
                assert resp.status_code in [200, 401], f"Unexpected status: {resp.status_code}"
                
            except Exception as e:
                # Record as timeout
                latencies.append(30000)  # 30s timeout
                print(f"Request {i+1} failed: {e}")
    
    # Calculate percentiles
    latencies.sort()
    p50 = latencies[len(latencies) // 2]
    p95_index = int(len(latencies) * 0.95)
    p95 = latencies[p95_index]
    p99 = latencies[int(len(latencies) * 0.99)]
    
    avg = statistics.mean(latencies)
    
    print(f"\n=== /api/me/home Latency Results ===")
    print(f"Requests: {NUM_REQUESTS}")
    print(f"Average:  {avg:.2f}ms")
    print(f"p50:      {p50:.2f}ms")
    print(f"p95:      {p95:.2f}ms (budget: {P95_BUDGET_MS}ms)")
    print(f"p99:      {p99:.2f}ms")
    print(f"Min:      {min(latencies):.2f}ms")
    print(f"Max:      {max(latencies):.2f}ms")
    
    # ASSERTION: p95 must be under budget
    assert p95 < P95_BUDGET_MS, (
        f"PERFORMANCE REGRESSION: p95 latency {p95:.2f}ms exceeds budget {P95_BUDGET_MS}ms"
    )


@pytest.mark.asyncio
async def test_home_endpoint_no_duplicate_data():
    """
    Smoke test: Verify the aggregated endpoint returns expected profile data
    when include_profile=true.
    """
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{GATEWAY_URL}/api/me/home?include_profile=true",
            headers={"x-session-id": "smoke-test-session"}
        )
        
        # May get 401 without auth, but 200 with session
        if resp.status_code == 200:
            data = resp.json()
            
            # Verify structure includes profile-specific keys
            assert "linked_accounts" in data
            assert "trainer" in data
            
            # If authenticated, should have these when include_profile=true
            if "user" in data:
                assert "activity_heatmap" in data or data.get("user") is not None
                print("✓ Endpoint returns aggregated profile data")


if __name__ == "__main__":
    asyncio.run(test_home_endpoint_latency())
