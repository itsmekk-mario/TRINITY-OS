export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  context?: Record<string, unknown>;
}

export interface AIResponse {
  content: string;
  provider: string;
  model: string;
}

/** Provider boundary: routes and application services never call an SDK directly. */
export interface AIProvider {
  readonly name: string;
  chat(messages: ChatMessage[], options: ChatOptions): Promise<AIResponse>;
}

export type AIErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_AUTHENTICATION_FAILED'
  | 'AI_ACCESS_DENIED'
  | 'AI_RATE_LIMITED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_TIMEOUT'
  | 'AI_INVALID_RESPONSE'
  | 'AI_REQUEST_FAILED'
  | 'LOCAL_AI_UNAVAILABLE'
  | 'LOCAL_AI_TIMEOUT'
  | 'LOCAL_AI_MODEL_NOT_AVAILABLE'
  | 'LOCAL_AI_INVALID_RESPONSE';

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: AIErrorCode,
    readonly retryAfterSeconds?: number,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}
