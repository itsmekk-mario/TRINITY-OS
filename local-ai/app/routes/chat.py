from __future__ import annotations

import json
import secrets
import time
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Header, Request
from fastapi.responses import StreamingResponse

from ..errors import LocalAIError
from ..ollama_client import parse_stream_line
from ..schemas import ChatRequest, ChatResponse

router = APIRouter(prefix="/chat", tags=["chat"])


async def authorize(request: Request, authorization: str | None = Header(default=None)) -> None:
    expected = request.app.state.settings.local_ai_api_key
    if not expected:
        return
    supplied = authorization[7:].strip() if authorization and authorization.lower().startswith("bearer ") else ""
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise LocalAIError("INVALID_API_KEY", "A valid bearer token is required.", 401)


@router.post("", response_model=ChatResponse, dependencies=[Depends(authorize)])
async def chat(body: ChatRequest, request: Request):
    return await request.app.state.inference.complete(body)


@router.post("/stream", dependencies=[Depends(authorize)])
async def chat_stream(body: ChatRequest, request: Request):
    service = request.app.state.inference
    await service.ensure_model()
    messages = service.messages(body)
    max_tokens = body.max_tokens or service.settings.ollama_max_tokens

    async def events() -> AsyncIterator[str]:
        started = time.perf_counter()
        try:
            async with service.client.stream_chat(messages, body.temperature, max_tokens) as lines:
                async for line in lines:
                    chunk = parse_stream_line(line)
                    content = chunk.get("message", {}).get("content", "")
                    if content:
                        yield f"event: token\ndata: {json.dumps({'token': content}, ensure_ascii=False)}\n\n"
                    if chunk.get("done"):
                        eval_count = chunk.get("eval_count")
                        eval_duration = chunk.get("eval_duration")
                        tokens_per_second = round(eval_count * 1_000_000_000 / eval_duration, 2) if isinstance(eval_count, int) and eval_count and isinstance(eval_duration, int) and eval_duration else None
                        data = {"model": chunk.get("model") or service.settings.ollama_model, "latency_ms": round((time.perf_counter() - started) * 1000), "prompt_tokens": chunk.get("prompt_eval_count"), "generated_tokens": eval_count, "tokens_per_second": tokens_per_second}
                        yield f"event: done\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        except LocalAIError as error:
            yield f"event: error\ndata: {json.dumps({'error': error.code}, ensure_ascii=False)}\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
