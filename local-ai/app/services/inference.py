from __future__ import annotations

import time
from typing import Any

from ..config import Settings
from ..context_formatter import format_context
from ..errors import LocalAIError
from ..ollama_client import OllamaClient
from ..schemas import ChatRequest

DEFAULT_SYSTEM_PROMPT = "너는 TRINITY OS의 학습 분석 AI다. 제공된 데이터만 근거로 간결하고 실행 가능한 답변을 한국어로 제공한다."


class InferenceService:
    def __init__(self, settings: Settings, client: OllamaClient) -> None:
        self.settings = settings
        self.client = client

    async def ensure_model(self) -> dict[str, Any]:
        model = await self.client.model_info()
        if model is None:
            raise LocalAIError("MODEL_NOT_AVAILABLE", f"Configured model '{self.settings.ollama_model}' is not installed.", 503)
        return model

    def messages(self, request: ChatRequest) -> list[dict[str, str]]:
        context = format_context(request.context, self.settings.max_context_bytes)
        user = request.message.strip()
        if context != "{}":
            user = f"선택된 학습 context(JSON):\n{context}\n\n사용자 요청:\n{user}"
        return [
            {"role": "system", "content": request.system_prompt or DEFAULT_SYSTEM_PROMPT},
            {"role": "user", "content": user},
        ]

    async def complete(self, request: ChatRequest) -> dict[str, Any]:
        await self.ensure_model()
        started = time.perf_counter()
        data = await self.client.chat(
            self.messages(request), request.temperature, request.max_tokens or self.settings.ollama_max_tokens
        )
        latency_ms = round((time.perf_counter() - started) * 1000)
        eval_count = data.get("eval_count") if isinstance(data.get("eval_count"), int) else None
        prompt_count = data.get("prompt_eval_count") if isinstance(data.get("prompt_eval_count"), int) else None
        eval_duration = data.get("eval_duration") if isinstance(data.get("eval_duration"), int) else None
        tokens_per_second = round(eval_count * 1_000_000_000 / eval_duration, 2) if eval_count and eval_duration else None
        return {
            "response": data["message"]["content"].strip(),
            "model": data.get("model") or self.settings.ollama_model,
            "latency_ms": latency_ms,
            "metrics": {
                "prompt_tokens": prompt_count,
                "generated_tokens": eval_count,
                "tokens_per_second": tokens_per_second,
            },
        }
