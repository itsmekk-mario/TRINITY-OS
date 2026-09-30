from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings, get_settings
from .errors import LocalAIError
from .ollama_client import OllamaClient
from .routes.chat import router as chat_router
from .routes.health import router as health_router
from .services.inference import InferenceService

logger = logging.getLogger("trinity.local_ai")


class RequestTooLarge(Exception):
    pass


class RequestSizeLimitMiddleware:
    def __init__(self, app, max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        try:
            declared = int(headers.get(b"content-length", b"0"))
        except ValueError:
            declared = 0
        if declared > self.max_bytes:
            response = JSONResponse({"error": "REQUEST_TOO_LARGE", "message": "Request body exceeds the configured size limit."}, status_code=413)
            await response(scope, receive, send)
            return
        received = 0

        async def limited_receive():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise RequestTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestTooLarge:
            response = JSONResponse({"error": "REQUEST_TOO_LARGE", "message": "Request body exceeds the configured size limit."}, status_code=413)
            await response(scope, receive, send)


def create_app(settings: Settings | None = None, ollama: OllamaClient | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=getattr(logging, settings.log_level.upper(), logging.INFO), format="%(message)s")
    app = FastAPI(title="TRINITY OS Local AI", version="1.0.0", docs_url="/docs")
    app.state.settings = settings
    app.state.ollama = ollama or OllamaClient(settings)
    app.state.inference = InferenceService(settings, app.state.ollama)
    app.add_middleware(RequestSizeLimitMiddleware, max_bytes=settings.max_request_bytes)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.middleware("http")
    async def access_log(request: Request, call_next):
        started = time.perf_counter()
        error_type = None
        try:
            response = await call_next(request)
            error_type = response.headers.get("X-Local-AI-Error")
            if error_type:
                del response.headers["X-Local-AI-Error"]
            return response
        finally:
            status = getattr(locals().get("response"), "status_code", 500)
            logger.info(json.dumps({
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "endpoint": request.url.path,
                "model": settings.ollama_model,
                "latency_ms": round((time.perf_counter() - started) * 1000),
                "success": status < 400,
                "status_code": status,
                "error_type": error_type,
            }, ensure_ascii=False))

    @app.exception_handler(LocalAIError)
    async def local_ai_error(_: Request, error: LocalAIError):
        return JSONResponse(
            {"error": error.code, "message": error.message},
            status_code=error.status_code,
            headers={"X-Local-AI-Error": error.code},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, __: RequestValidationError):
        return JSONResponse(
            {"error": "MALFORMED_REQUEST", "message": "Request validation failed."},
            status_code=422,
            headers={"X-Local-AI-Error": "MALFORMED_REQUEST"},
        )

    app.include_router(health_router)
    app.include_router(chat_router)
    return app


app = create_app()
