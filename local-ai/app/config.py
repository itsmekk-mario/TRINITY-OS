from __future__ import annotations

import ipaddress
from functools import lru_cache

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen3:8b"
    local_ai_host: str = "127.0.0.1"
    local_ai_port: int = Field(default=8765, ge=1, le=65535)
    local_ai_api_key: str = ""
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173"
    ollama_connect_timeout_seconds: float = Field(default=5.0, gt=0, le=60)
    ollama_timeout_seconds: float = Field(default=180.0, gt=0, le=1800)
    ollama_keep_alive: str = "5m"
    ollama_think: bool = False
    ollama_num_ctx: int = Field(default=8192, ge=1024, le=131072)
    ollama_max_tokens: int = Field(default=1024, ge=1, le=8192)
    max_context_bytes: int = Field(default=32768, ge=1024, le=1_048_576)
    max_request_bytes: int = Field(default=65536, ge=4096, le=2_097_152)
    log_level: str = "INFO"

    @field_validator("ollama_base_url")
    @classmethod
    def normalize_ollama_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if not value.startswith(("http://", "https://")):
            raise ValueError("OLLAMA_BASE_URL must be an http(s) URL")
        return value

    @field_validator("ollama_model")
    @classmethod
    def require_model(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("OLLAMA_MODEL must not be empty")
        return value.strip()

    @model_validator(mode="after")
    def protect_non_loopback_binding(self) -> "Settings":
        try:
            is_loopback = ipaddress.ip_address(self.local_ai_host).is_loopback
        except ValueError:
            is_loopback = self.local_ai_host.lower() == "localhost"
        if not is_loopback:
            raise ValueError("LOCAL_AI_HOST must remain loopback-only; use Cloudflare Tunnel for external access")
        return self

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
