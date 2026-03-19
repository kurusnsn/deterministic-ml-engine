import time
from fastapi import FastAPI, Request
from app.routers import games
from observability import (
    init_observability,
    instrument_fastapi,
    set_request_context,
    clear_request_context,
    record_http_metrics,
    start_event_loop_lag_monitor,
)

init_observability("import")

app = FastAPI(title="Import Service")
instrument_fastapi(app)


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or request.headers.get("x-requestid")
    route = f"{request.method} {request.url.path}"
    set_request_context(route, request_id, "import")
    start = time.perf_counter()
    response = None
    try:
        response = await call_next(request)
        return response
    finally:
        route_obj = request.scope.get("route")
        route_path = getattr(route_obj, "path", request.url.path)
        route = f"{request.method} {route_path}"
        set_request_context(route, request_id, "import")
        duration_ms = (time.perf_counter() - start) * 1000
        status_code = response.status_code if response else 500
        record_http_metrics(route, request.method, status_code, duration_ms)
        clear_request_context()


@app.on_event("startup")
async def on_startup():
    await start_event_loop_lag_monitor()

# Register games router
app.include_router(games.router, prefix="/games", tags=["games"])


@app.get("/")
def root():
    return {"message": "Import Service is running"}


@app.get("/healthz")
def healthz():
    """Health check endpoint for Kubernetes probes."""
    return {"status": "healthy", "service": "import"}
