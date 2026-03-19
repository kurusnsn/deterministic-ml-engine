import time
import logging
from fastapi import FastAPI, Request
from .routers.book import router as book_router
from .scripts.apply_migrations import apply_migrations
import threading
from observability import (
    init_observability,
    instrument_fastapi,
    set_request_context,
    clear_request_context,
    record_http_metrics,
    start_event_loop_lag_monitor,
)

init_observability("opening-book")

logger = logging.getLogger(__name__)

def create_app() -> FastAPI:
    app = FastAPI(title="Opening Book Service", version="0.1.0")
    instrument_fastapi(app)

    @app.middleware("http")
    async def observability_middleware(request: Request, call_next):
        request_id = request.headers.get("x-request-id") or request.headers.get("x-requestid")
        route = f"{request.method} {request.url.path}"
        set_request_context(route, request_id, "opening-book")
        start = time.perf_counter()
        response = None
        try:
            response = await call_next(request)
            return response
        finally:
            route_obj = request.scope.get("route")
            route_path = getattr(route_obj, "path", request.url.path)
            route = f"{request.method} {route_path}"
            set_request_context(route, request_id, "opening-book")
            duration_ms = (time.perf_counter() - start) * 1000
            status_code = response.status_code if response else 500
            record_http_metrics(route, request.method, status_code, duration_ms)
            clear_request_context()
    app.include_router(book_router, prefix="/opening")
    
    @app.get("/health")
    async def health():
        return {"status": "ok", "service": "opening-book"}
    
    @app.on_event("startup")
    async def startup_event():
        await start_event_loop_lag_monitor()
        # Run migrations in a separate thread to avoid blocking event loop if it takes time,
        # although typically simple schema updates are fast.
        # Alternatively, run synchronously if we want to ensure DB is ready before accepting requests.
        # Given this is a simple service, synchronous run is safer for correctness.
        try:
            apply_migrations()
        except Exception as e:
            logger.info(f"Startup migration failed: {e}")

    return app

app = create_app()
