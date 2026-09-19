from __future__ import annotations

import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import httpx

from .config import Settings
from .errors import LocalAIError


class OllamaClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.timeout = httpx.Timeout(
            connect=settings.ollama_connect_timeout_seconds,
            read=settings.ollama_timeout_seconds,
            write=settings.ollama_connect_timeout_seconds,
            pool=settings.ollama_connect_timeout_seconds,
        )

    async def _request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
        try:
            async with httpx.AsyncClient(base_url=self.settings.ollama_base_url, timeout=self.timeout) as client:
                response = await client.request(method, path, **kwargs)
                response.raise_for_status()
                return response
        except httpx.TimeoutException as exc:
            raise LocalAIError("INFERENCE_TIMEOUT", "Ollama request timed out.", 504) from exc
        except (httpx.ConnectError, httpx.NetworkError) as exc:
            raise LocalAIError("OLLAMA_UNAVAILABLE", "Ollama is not reachable.", 503) from exc
        except httpx.HTTPStatusError as exc:
            raise LocalAIError("MODEL_RESPONSE_FAILURE", "Ollama returned an error response.", 502) from exc

    async def tags(self) -> list[dict[str, Any]]:
        response = await self._request("GET", "/api/tags")
        try:
            models = response.json().get("models", [])
            return models if isinstance(models, list) else []
        except (ValueError, AttributeError) as exc:
            raise LocalAIError("MODEL_RESPONSE_FAILURE", "Ollama returned invalid model metadata.", 502) from exc

    async def model_info(self) -> dict[str, Any] | None:
        configured = self.settings.ollama_model
        names = {configured, f"{configured}:latest" if ":" not in configured else configured}
        for model in await self.tags():
            if model.get("name") in names or model.get("model") in names:
                return model
        return None

    def payload(self, messages: list[dict[str, str]], temperature: float, max_tokens: int, stream: bool) -> dict[str, Any]:
        return {
            "model": self.settings.ollama_model,
            "messages": messages,
            "stream": stream,
            # Qwen3 otherwise spends the token budget in a separate thinking field,
            # while the stable TRINITY contract expects the answer in message.content.
            "think": self.settings.ollama_think,
            "keep_alive": self.settings.ollama_keep_alive,
            "options": {
                "temperature": temperature,
                "num_ctx": self.settings.ollama_num_ctx,
                "num_predict": min(max_tokens, self.settings.ollama_max_tokens),
            },
        }

    async def chat(self, messages: list[dict[str, str]], temperature: float, max_tokens: int) -> dict[str, Any]:
        response = await self._request("POST", "/api/chat", json=self.payload(messages, temperature, max_tokens, False))
        try:
            data = response.json()
            content = data.get("message", {}).get("content")
            if not isinstance(content, str) or not content.strip():
                raise ValueError("missing message content")
            return data
        except (ValueError, AttributeError) as exc:
            raise LocalAIError("MODEL_RESPONSE_FAILURE", "Ollama returned an invalid chat response.", 502) from exc

    @asynccontextmanager
    async def stream_chat(self, messages: list[dict[str, str]], temperature: float, max_tokens: int) -> AsyncIterator[AsyncIterator[str]]:
        client = httpx.AsyncClient(base_url=self.settings.ollama_base_url, timeout=self.timeout)
        try:
            try:
                response = await client.send(
                    client.build_request("POST", "/api/chat", json=self.payload(messages, temperature, max_tokens, True)),
                    stream=True,
                )
                response.raise_for_status()
            except httpx.TimeoutException as exc:
                raise LocalAIError("INFERENCE_TIMEOUT", "Ollama request timed out.", 504) from exc
            except (httpx.ConnectError, httpx.NetworkError) as exc:
                raise LocalAIError("OLLAMA_UNAVAILABLE", "Ollama is not reachable.", 503) from exc
            except httpx.HTTPStatusError as exc:
                raise LocalAIError("MODEL_RESPONSE_FAILURE", "Ollama returned an error response.", 502) from exc

            async def lines() -> AsyncIterator[str]:
                try:
                    async for line in response.aiter_lines():
                        if line:
                            yield line
                except httpx.TimeoutException as exc:
                    raise LocalAIError("INFERENCE_TIMEOUT", "Ollama stream timed out.", 504) from exc
                except (httpx.NetworkError, httpx.RemoteProtocolError) as exc:
                    raise LocalAIError("MODEL_RESPONSE_FAILURE", "Ollama stream was interrupted.", 502) from exc

            yield lines()
        finally:
            await client.aclose()


def parse_stream_line(line: str) -> dict[str, Any]:
    try:
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError
        return value
    except ValueError as exc:
        raise LocalAIError("MODEL_RESPONSE_FAILURE", "Ollama returned an invalid stream chunk.", 502) from exc
