"""AegisLens API application factory and entry point."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from starlette.middleware.base import BaseHTTPMiddleware

from . import schemas
from .config import (
    APP_NAME,
    APP_SUBTITLE,
    APP_VERSION,
    CORS_ORIGINS,
    SEED_ON_STARTUP,
    STATIC_DIR,
)
from .database import SessionLocal, create_all, engine
from .routers import controls, dashboard, evidence, findings, reports
from .seed import seed_database

logger = logging.getLogger("aegislens")

DESCRIPTION = f"""
{APP_SUBTITLE}.

AegisLens organises security evidence, tracks findings, scores risk with a
transparent `likelihood x impact` model, and generates assessment reports.

**This is an educational, defensive tool that ships with synthetic sample data.**
It is not a SIEM, a vulnerability scanner, or a substitute for a professional audit.
"""

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Attach a small set of conservative response headers."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        for header, value in SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables and load the sample dataset on first start."""
    create_all()
    if SEED_ON_STARTUP:
        with SessionLocal() as db:
            if seed_database(db):
                logger.info("Loaded the synthetic sample dataset.")
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=f"{APP_NAME} API",
        description=DESCRIPTION,
        version=APP_VERSION,
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        """Return field-level messages without echoing internal state."""
        problems = [
            {
                "field": ".".join(str(part) for part in error["loc"][1:]) or "body",
                "message": error["msg"],
            }
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={"detail": "The submitted data is not valid.", "problems": problems},
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(_: Request, exc: ValueError) -> JSONResponse:
        """Surface risk-model validation errors as 422 rather than a 500."""
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.get("/api/health", response_model=schemas.HealthOut, tags=["system"])
    def health() -> dict:
        """Liveness check that also confirms the database answers a query."""
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            database = "connected"
        except Exception:  # pragma: no cover - only on a broken database file
            logger.exception("Health check could not reach the database")
            database = "unavailable"
        return {
            "status": "ok",
            "app": APP_NAME,
            "version": APP_VERSION,
            "database": database,
        }

    app.include_router(dashboard.router)
    app.include_router(findings.router)
    app.include_router(evidence.router)
    app.include_router(controls.router)
    app.include_router(reports.router)

    _mount_frontend(app)
    return app


def _mount_frontend(app: FastAPI) -> None:
    """Serve the built frontend when a bundle is present (single-container mode)."""
    index_file = STATIC_DIR / "index.html"
    if not index_file.exists():
        @app.get("/", include_in_schema=False)
        def api_root() -> dict:
            return {
                "app": APP_NAME,
                "subtitle": APP_SUBTITLE,
                "version": APP_VERSION,
                "docs": "/api/docs",
                "note": "No frontend bundle found. Run the Vite dev server or build the frontend.",
            }

        return

    assets_dir = STATIC_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/", include_in_schema=False)
    def index() -> FileResponse:
        return FileResponse(index_file)

    @app.get("/{full_path:path}", include_in_schema=False)
    def single_page_app(full_path: str) -> FileResponse:
        """Return the SPA shell for client-side routes.

        Only files that already exist inside the bundle directory are served, and
        the resolved path is checked to stay within it.
        """
        candidate = (STATIC_DIR / full_path).resolve()
        if candidate.is_file() and candidate.is_relative_to(STATIC_DIR.resolve()):
            return FileResponse(candidate)
        return FileResponse(index_file)


app = create_app()
