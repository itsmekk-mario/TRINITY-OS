import { AIProviderError, type AIProvider, type AIResponse, type ChatMessage, type ChatOptions } from '../types.ts';

export interface LocalQwenConfig {
  localAIBaseUrl?: string;
  localAIApiKey?: string;
  localAITimeoutMs?: string;
  localAIModel?: string;
  debug?: string;
  environment?: string;
}

type LocalAIResponse = {
  response?: unknown;
  model?: unknown;
  error?: unknown;
  message?: unknown;
};

const boundedTimeout = (value: string | undefined) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 120_000 ? parsed : 30_000;
};

const debugEnabled = (config: LocalQwenConfig) => config.debug === 'true' || config.environment === 'development';

function errorFor(status: number, code: unknown): AIProviderError {
  if (status === 401) return new AIProviderError('Local AI authentication failed.', 503, 'AI_AUTHENTICATION_FAILED');
  if (code === 'MODEL_NOT_AVAILABLE') return new AIProviderError('The configured Local AI model is unavailable.', 503, 'LOCAL_AI_MODEL_NOT_AVAILABLE');
  if (code === 'INFERENCE_TIMEOUT' || status === 504) return new AIProviderError('Local AI inference timed out.', 504, 'LOCAL_AI_TIMEOUT');
  if (code === 'OLLAMA_UNAVAILABLE' || status === 503) return new AIProviderError('Local AI is unavailable.', 503, 'LOCAL_AI_UNAVAILABLE');
  return new AIProviderError('Local AI returned an invalid response.', 502, 'LOCAL_AI_INVALID_RESPONSE');
}

export class LocalQwenProvider implements AIProvider {
  readonly name = 'local-qwen';
  private readonly endpoint: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: LocalQwenConfig) {
    this.endpoint = `${(config.localAIBaseUrl || '').replace(/\/+$/, '')}/chat`;
    this.timeoutMs = boundedTimeout(config.localAITimeoutMs);
  }

  async chat(messages: ChatMessage[], options: ChatOptions): Promise<AIResponse> {
    if (!this.config.localAIBaseUrl || !this.config.localAIApiKey) {
      throw new AIProviderError('Local AI provider is not configured.', 503, 'AI_NOT_CONFIGURED');
    }
    const system = messages.find((message) => message.role === 'system')?.content;
    const conversation = messages.filter((message) => message.role !== 'system').map((message) => `${message.role}: ${message.content}`).join('\n');
    if (!conversation) throw new AIProviderError('Local AI request is empty.', 400, 'AI_REQUEST_FAILED');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.config.localAIApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: conversation, system_prompt: system, context: options.context ?? {}, temperature: options.temperature ?? 0.2, max_tokens: options.maxTokens }),
      });
      const payload: LocalAIResponse = await response.json<LocalAIResponse>().catch(() => ({}));
      if (!response.ok) {
        if (debugEnabled(this.config)) console.error(JSON.stringify({ event: 'local_ai_error', status: response.status, code: payload.error }));
        throw errorFor(response.status, payload.error);
      }
      if (typeof payload.response !== 'string' || !payload.response.trim()) throw errorFor(502, payload.error);
      return { content: payload.response.trim(), provider: this.name, model: typeof payload.model === 'string' ? payload.model : this.config.localAIModel || 'qwen3:8b' };
    } catch (cause) {
      if (cause instanceof AIProviderError) throw cause;
      if (cause instanceof DOMException && cause.name === 'AbortError') throw new AIProviderError('Local AI inference timed out.', 504, 'LOCAL_AI_TIMEOUT');
      if (debugEnabled(this.config)) console.error(JSON.stringify({ event: 'local_ai_network_error', error: cause instanceof Error ? cause.message : String(cause) }));
      throw new AIProviderError('Local AI connection failed.', 503, 'LOCAL_AI_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
  }
}
