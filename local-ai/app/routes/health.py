from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from ..errors import LocalAIError
from ..schemas import HealthResponse, ModelResponse

router = APIRouter(tags=["status"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request):
    settings = request.app.state.settings
    try:
        model = await request.app.state.ollama.model_info()
        if model is None:
            return JSONResponse(
                {"status": "error", "ollama": True, "model": settings.ollama_model, "error": "MODEL_NOT_AVAILABLE"},
                status_code=503,
                headers={"X-Local-AI-Error": "MODEL_NOT_AVAILABLE"},
            )
        return {"status": "ok", "ollama": True, "model": settings.ollama_model}
    except LocalAIError as error:
        return JSONResponse(
            {"status": "error", "ollama": False, "model": settings.ollama_model, "error": error.code},
            status_code=error.status_code,
            headers={"X-Local-AI-Error": error.code},
        )


@router.get("/model", response_model=ModelResponse)
async def model(request: Request):
    settings = request.app.state.settings
    info = await request.app.state.ollama.model_info()
    details = info.get("details", {}) if info else {}
    return {
        "provider": "ollama",
        "model": settings.ollama_model,
        "available": info is not None,
        "size_bytes": info.get("size") if info else None,
        "quantization": details.get("quantization_level") if isinstance(details, dict) else None,
    }
