from __future__ import annotations

import json
import os
import subprocess
import time
from typing import Any

import httpx


BASE_URL = os.getenv("LOCAL_AI_BENCHMARK_URL", "http://127.0.0.1:8765").rstrip("/")
API_KEY = os.getenv("LOCAL_AI_API_KEY", "")
HEADERS = {"Authorization": f"Bearer {API_KEY}"} if API_KEY else {}
CASES: list[tuple[str, dict[str, Any]]] = [
    ("short_conversation", {"message": "오늘 공부 계획을 간단히 정리해줘.", "max_tokens": 160}),
    ("korean_reasoning", {"message": "수학 문제를 많이 풀었지만 같은 조건 해석 실수를 반복했다. 가장 큰 병목 하나와 내일 할 행동 하나를 분석해줘.", "max_tokens": 220}),
    ("structured_context", {
        "message": "최근 학습 기록에서 가장 큰 병목 하나와 다음 행동을 알려줘.",
        "max_tokens": 220,
        "context": {
            "sessions": [{"date": "2026-09-15", "subject": "수학", "seconds": 5400}],
            "scores": [{"date": "2026-09-14", "name": "주간 점검", "math": 72}],
            "wrongAnswerDrills": [{"subject": "수학", "bottleneck": "조건 해석 누락", "retry": "scheduled"}],
            "weeklyCapabilityGoals": [{"subject": "수학", "ability": "조건 표시", "done": False}],
            "dailyDrills": [{"subject": "수학", "title": "조건에 밑줄 긋기", "done": False}],
        },
    }),
]


def gpu_snapshot() -> dict[str, Any] | None:
    try:
        output = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=name,memory.used,memory.total,utilization.gpu,power.draw", "--format=csv,noheader,nounits"],
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=10,
        ).strip().split(", ")
        return {"name": output[0], "memory_used_mib": int(output[1]), "memory_total_mib": int(output[2]), "utilization_percent": int(output[3]), "power_watts": float(output[4])}
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return None


def stream_case(client: httpx.Client, name: str, payload: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    first_token_ms: int | None = None
    done: dict[str, Any] = {}
    token_events = 0
    current_event = "message"
    with client.stream("POST", f"{BASE_URL}/chat/stream", headers=HEADERS, json=payload) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            if line.startswith("event: "):
                current_event = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
                if current_event == "token":
                    token_events += 1
                    if first_token_ms is None:
                        first_token_ms = round((time.perf_counter() - started) * 1000)
                elif current_event == "done":
                    done = data
                elif current_event == "error":
                    raise RuntimeError(f"stream error: {data.get('error', 'unknown')}")
    return {"case": name, "ttft_ms": first_token_ms, "wall_ms": round((time.perf_counter() - started) * 1000), "token_events": token_events, **done, "gpu_after": gpu_snapshot()}


def main() -> None:
    with httpx.Client(timeout=httpx.Timeout(240, connect=5)) as client:
        health = client.get(f"{BASE_URL}/health").json()
        model = client.get(f"{BASE_URL}/model").json()
        results = [stream_case(client, name, payload) for name, payload in CASES]
    print(json.dumps({"health": health, "model": model, "results": results}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
