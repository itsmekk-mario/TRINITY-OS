from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.errors import LocalAIError
from app.main import create_app


class FakeOllama:
    def __init__(self, *, available: bool = True, offline: bool = False) -> None:
        self.available = available
        self.offline = offline

    async def model_info(self) -> dict[str, Any] | None:
        if self.offline:
            raise LocalAIError("OLLAMA_UNAVAILABLE", "offline", 503)
        return {"name": "qwen3:8b", "size": 5_200_000_000, "details": {"quantization_level": "Q4_K_M"}} if self.available else None

    async def chat(self, messages, temperature, max_tokens):
        return {"model": "qwen3:8b", "message": {"content": "분석 결과입니다."}, "prompt_eval_count": 20, "eval_count": 10, "eval_duration": 1_000_000_000}


def client(fake: FakeOllama | None = None, api_key: str = "") -> TestClient:
    settings = Settings(_env_file=None, local_ai_api_key=api_key)
    return TestClient(create_app(settings, fake or FakeOllama()))


def test_ollama_payload_disables_separate_thinking_by_default():
    api = create_app(Settings(_env_file=None), FakeOllama())
    from app.ollama_client import OllamaClient

    payload = OllamaClient(api.state.settings).payload([{"role": "user", "content": "안녕"}], 0.6, 64, False)
    assert payload["think"] is False


def test_local_ai_host_is_always_loopback_only():
    with pytest.raises(ValueError):
        Settings(_env_file=None, local_ai_host="0.0.0.0", local_ai_api_key="secret")


def test_health_checks_ollama_and_model():
    response = client().get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "ollama": True, "model": "qwen3:8b", "error": None}


def test_model_endpoint_reports_metadata():
    response = client().get("/model")
    assert response.status_code == 200
    assert response.json()["available"] is True
    assert response.json()["quantization"] == "Q4_K_M"


def test_chat_request_validation():
    response = client().post("/chat", json={"message": "", "temperature": 3})
    assert response.status_code == 422
    assert response.json()["error"] == "MALFORMED_REQUEST"


def test_ollama_unavailable():
    response = client(FakeOllama(offline=True)).get("/health")
    assert response.status_code == 503
    assert response.json()["error"] == "OLLAMA_UNAVAILABLE"


def test_model_unavailable_blocks_chat():
    response = client(FakeOllama(available=False)).post("/chat", json={"message": "안녕"})
    assert response.status_code == 503
    assert response.json()["error"] == "MODEL_NOT_AVAILABLE"


def test_context_too_large():
    settings = Settings(_env_file=None, max_context_bytes=1024)
    api = TestClient(create_app(settings, FakeOllama()))
    response = api.post(
        "/chat",
        json={"message": "분석해줘", "context": {"sessions": [{"note": "가" * 500} for _ in range(4)]}},
    )
    assert response.status_code == 413
    assert response.json()["error"] == "CONTEXT_TOO_LARGE"


def test_request_body_too_large():
    settings = Settings(_env_file=None, max_request_bytes=4096)
    api = TestClient(create_app(settings, FakeOllama()))
    response = api.post("/chat", json={"message": "가" * 8000})
    assert response.status_code == 413
    assert response.json()["error"] == "REQUEST_TOO_LARGE"


@pytest.mark.parametrize("header", [None, "Bearer wrong"])
def test_authentication_rejects_missing_or_invalid_key(header):
    headers = {"Authorization": header} if header else {}
    response = client(api_key="test-secret").post("/chat", json={"message": "안녕"}, headers=headers)
    assert response.status_code == 401
    assert response.json()["error"] == "INVALID_API_KEY"


def test_authenticated_chat_and_context_filtering():
    response = client(api_key="test-secret").post(
        "/chat",
        json={"message": "분석해줘", "context": {"sessions": [{"subject": "수학", "token": "hidden"}], "unknown": {"private": True}}},
        headers={"Authorization": "Bearer test-secret"},
    )
    assert response.status_code == 200
    assert response.json()["response"] == "분석 결과입니다."
    assert response.json()["metrics"]["tokens_per_second"] == 10.0
