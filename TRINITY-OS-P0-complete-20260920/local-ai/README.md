# TRINITY OS Local AI (Phase 1)

Windows RTX 3060 PC에서 실행되는 독립 inference service입니다. 기존 React UI, Cloudflare Worker, D1에는 손대지 않으며 다음 Phase에서 Worker가 Cloudflare Tunnel을 통해 이 API를 호출할 수 있도록 안정된 HTTP contract를 제공합니다.

```text
Client / future Cloudflare Worker
                |
                | HTTP (현재 loopback 전용)
                v
             FastAPI
                |
                | Ollama HTTP API
                v
              Ollama
                |
                v
             qwen3:8b
```

Local AI는 D1에 직접 접근하지 않습니다. 데이터 선택, 사용자 인증, 캐시와 사용량 정책은 향후 Cloudflare 계층이 담당하고, 이 서비스는 제한된 context를 받아 inference만 수행합니다.

## 기본 모델 선택

기본값은 `qwen3:8b`입니다. Ollama 공식 태그는 8.19B Q4_K_M이며 약 5.2GB입니다. Qwen3은 reasoning, 대화, instruction following과 100개 이상의 언어를 지원합니다. RTX 3060 12GB에서 14B Q4_K_M(약 9.3GB)보다 모델 외 KV cache와 CUDA runtime을 위한 VRAM 여유가 커서 8K context에서 GPU 중심 실행, 응답 속도, 장시간 안정성의 균형이 좋습니다. 실제 성능과 VRAM은 드라이버, Ollama 버전, prompt 길이에 따라 달라지므로 측정값을 추정하지 않습니다.

- Ollama model: https://ollama.com/library/qwen3:8b
- 다른 모델은 `.env`의 `OLLAMA_MODEL` 한 곳에서 변경합니다.
- 기본 `OLLAMA_NUM_CTX=8192`는 공식 최대 context보다 의도적으로 작습니다.

## Windows 설치

PowerShell에서 아래 순서로 진행합니다.

```powershell
nvidia-smi
ollama --version
ollama pull qwen3:8b

cd C:\path\to\TRINITY-OS\local-ai
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
.\start.ps1
```

PowerShell의 실행 정책이 activation을 막으면 현재 shell에서만 다음을 실행한 뒤 다시 활성화합니다.

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

`start.ps1`은 Python/dependency, `.env`, Ollama 연결, 설치 모델을 확인하고 NVIDIA 도구는 경고 수준으로 진단한 뒤 FastAPI를 시작합니다. bind는 항상 loopback(`127.0.0.1:8765`)이어야 하며 설정 검증과 시작 스크립트가 non-loopback 값을 거부합니다. 비어 있는 `LOCAL_AI_API_KEY`는 loopback 개발에서만 사용하고, Cloudflare Tunnel을 시작하기 전에는 반드시 설정합니다.

## 설정

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Ollama HTTP endpoint |
| `OLLAMA_MODEL` | `qwen3:8b` | 설치된 model tag |
| `LOCAL_AI_HOST` | `127.0.0.1` | FastAPI bind address |
| `LOCAL_AI_PORT` | `8765` | FastAPI port |
| `LOCAL_AI_API_KEY` | 빈 값 | 설정 시 `/chat*` Bearer 인증 필수 |
| `ALLOWED_ORIGINS` | Vite dev/preview origins | 쉼표 구분 CORS allowlist |
| `OLLAMA_CONNECT_TIMEOUT_SECONDS` | `5` | 연결 timeout |
| `OLLAMA_TIMEOUT_SECONDS` | `180` | inference/read timeout |
| `OLLAMA_KEEP_ALIVE` | `5m` | 모델 VRAM 유지 시간 |
| `OLLAMA_THINK` | `false` | Qwen3 답변을 안정적으로 `message.content`에 반환 |
| `OLLAMA_NUM_CTX` | `8192` | context window 상한 |
| `OLLAMA_MAX_TOKENS` | `1024` | 최대 생성 token |
| `MAX_CONTEXT_BYTES` | `32768` | 선택·정리 후 context byte 상한 |
| `MAX_REQUEST_BYTES` | `65536` | 선언/stream 방식 모두에 적용되는 request body 상한 |

전력 절약은 `OLLAMA_KEEP_ALIVE=0`, 균형은 `5m`, 반복 요청 성능 우선은 더 긴 값으로 조절할 수 있습니다. 유휴 시 FastAPI 자체는 GPU inference를 실행하지 않습니다. Ollama의 모델 unload 동작은 설치 버전의 keep-alive 의미를 따릅니다.

`OLLAMA_THINK=false`는 Qwen3가 제한된 생성 token을 별도 thinking field에 모두 사용해 빈 `message.content`를 반환하는 것을 방지합니다. 향후 thinking 결과를 API contract에 별도로 노출할 때만 명시적으로 활성화하십시오.

`.env`는 repository의 `.gitignore`에 의해 제외됩니다. 실제 secret을 `.env.example`, source, frontend 또는 Worker 변수에 넣지 마십시오.

## API

### 상태와 모델

`GET /health`는 `/api/tags`로 Ollama의 실제 응답과 모델 설치 여부를 함께 확인합니다. Ollama offline 또는 모델 누락 시 HTTP 503과 안정된 error code를 반환합니다. `GET /model`은 provider, model tag, 설치 여부와 Ollama가 제공한 size/quantization을 반환합니다.

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
Invoke-RestMethod http://127.0.0.1:8765/model
```

### Non-streaming chat

```powershell
$headers = @{}
# LOCAL_AI_API_KEY를 설정했다면 다음 줄의 값을 동일하게 설정합니다.
# $headers.Authorization = 'Bearer YOUR_LOCAL_AI_API_KEY'
$body = @{
  message = '이번 주 학습 병목을 분석해줘.'
  system_prompt = '너는 TRINITY OS의 학습 분석 AI다.'
  temperature = 0.6
  context = @{
    sessions = @()
    scores = @()
    wrongAnswers = @()
    weeklyCapabilityGoals = @()
    dailyDrills = @()
    plaire = @{}
    trinity = @{}
  }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:8765/chat `
  -Headers $headers `
  -ContentType 'application/json; charset=utf-8' `
  -Body $body
```

응답에는 `response`, `model`, `latency_ms`와 Ollama가 제공한 경우에만 prompt/generated token 및 tokens/sec가 포함됩니다. context formatter는 알려진 학습 section만 선택하고 item 수, string 길이, 중첩 깊이와 총 byte를 제한하며 secret처럼 보이는 field를 제거합니다.

### Streaming

`POST /chat/stream`은 SSE를 반환합니다. `token`, `done`, 실행 중 오류가 있으면 `error` event가 전달됩니다. request body와 인증 방식은 `/chat`과 같습니다. 브라우저 `EventSource`는 POST를 지원하지 않으므로 frontend에서는 `fetch()`의 response stream을 읽는 방식으로 연결합니다.

세 가지 고정 prompt로 TTFT, total latency, tokens/sec와 요청 직후 GPU 상태를 기록하려면 FastAPI 실행 중 다음을 사용합니다. 결과에는 prompt 원문이나 context 전체를 출력하지 않습니다.

```powershell
.\.venv\Scripts\python.exe .\scripts\benchmark.py
```

## 오류 contract

| HTTP | `error` | 의미 |
| --- | --- | --- |
| 401 | `INVALID_API_KEY` | Bearer token 누락/불일치 |
| 413 | `CONTEXT_TOO_LARGE` | 정리된 context가 제한 초과 |
| 413 | `REQUEST_TOO_LARGE` | 전체 request body가 제한 초과 |
| 422 | `MALFORMED_REQUEST` | schema validation 실패 |
| 503 | `OLLAMA_UNAVAILABLE` | Ollama 연결 불가 |
| 503 | `MODEL_NOT_AVAILABLE` | 설정 모델 미설치 |
| 504 | `INFERENCE_TIMEOUT` | timeout 초과 |
| 502 | `MODEL_RESPONSE_FAILURE` | Ollama 오류/비정상 응답 |

접근 로그는 timestamp, endpoint, model, latency, status, success와 error type만 stdout에 JSON으로 기록합니다. prompt와 context는 기록하지 않습니다.

## 테스트

GPU나 Ollama 없이 mock으로 대부분의 API contract를 검사합니다.

```powershell
cd local-ai
.\.venv\Scripts\Activate.ps1
pytest -q
```

## RTX 3060 실제 검증

1. 첫 PowerShell에서 `ollama serve`가 필요한 설치 방식이면 실행합니다.
2. `ollama list`에서 `qwen3:8b`를 확인합니다.
3. 두 번째 PowerShell에서 `.\start.ps1`을 실행합니다.
4. `/health`, `/model`, `/chat` 순서로 위 smoke test를 실행합니다.
5. 생성이 진행되는 동안 세 번째 PowerShell에서 반복 확인합니다.

```powershell
nvidia-smi -l 1
ollama ps
```

`nvidia-smi`의 Ollama process, GPU utilization, VRAM 사용량을 확인하고 `ollama ps`의 processor가 GPU 중심인지 확인합니다. 테스트 기록에는 model/tag, quantization(`/model`), VRAM, prompt/generated tokens, total latency, tokens/sec를 적습니다. 값이 API나 도구에 표시되지 않으면 임의로 채우지 않습니다. CPU offload가 크다면 context를 줄이거나 8B Q4 tag인지 먼저 확인하십시오.

## 다음 Phase 경계

Cloudflare Tunnel은 인증된 private route로 이 loopback service를 연결하고 Worker에 tunnel origin과 service credential을 secret으로 둡니다. Worker의 기존 AI provider interface 뒤에 Local AI provider를 추가해 D1 context selector → prompt builder → tunnel → `/chat` 순서를 사용합니다. Local AI가 D1 credential이나 사용자 session을 받거나 저장하지 않도록 유지합니다.

## Cloudflare Tunnel 설정

Phase 2 Worker provider는 `https://ai.trinityos.mcv.kr/chat`을 호출하도록 준비되어 있습니다. FastAPI와 Ollama는 계속 loopback에만 bind합니다. `cloudflared` 설치와 Cloudflare 계정 인증 후 다음 순서로 locally-managed tunnel을 만듭니다.

```powershell
cloudflared tunnel login
cloudflared tunnel create trinity-local-ai
Copy-Item .\cloudflared\config.example.yml "$env:USERPROFILE\.cloudflared\trinity-local-ai.yml"
# 생성된 UUID와 Windows 사용자 경로를 복사본에 입력
cloudflared tunnel --config "$env:USERPROFILE\.cloudflared\trinity-local-ai.yml" ingress validate
cloudflared tunnel route dns trinity-local-ai ai.trinityos.mcv.kr
cloudflared tunnel --config "$env:USERPROFILE\.cloudflared\trinity-local-ai.yml" run trinity-local-ai
```

repository의 파일은 credential이 없는 template입니다. 실제 UUID credential JSON과 tunnel token은 사용자 profile 아래에만 보관하고 commit하지 않습니다. ingress는 `/health`, `/model`, `/chat`, `/chat/stream`만 origin으로 전달하고 나머지는 404로 종료합니다. `/chat*`은 Tunnel hostname을 아는 것만으로 사용할 수 없으며 `LOCAL_AI_API_KEY` Bearer token이 필요합니다.
