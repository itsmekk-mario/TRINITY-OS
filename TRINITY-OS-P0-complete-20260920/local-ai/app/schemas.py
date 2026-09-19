from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=8000)
    system_prompt: str | None = Field(default=None, max_length=4000)
    context: dict[str, Any] = Field(default_factory=dict)
    temperature: float = Field(default=0.6, ge=0, le=2)
    max_tokens: int | None = Field(default=None, ge=1, le=8192)


class InferenceMetrics(BaseModel):
    prompt_tokens: int | None = None
    generated_tokens: int | None = None
    tokens_per_second: float | None = None


class ChatResponse(BaseModel):
    response: str
    model: str
    latency_ms: int
    metrics: InferenceMetrics | None = None


class HealthResponse(BaseModel):
    status: str
    ollama: bool
    model: str
    error: str | None = None


class ModelResponse(BaseModel):
    provider: str = "ollama"
    model: str
    available: bool
    size_bytes: int | None = None
    quantization: str | None = None
