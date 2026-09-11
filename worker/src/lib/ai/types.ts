export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatOptions {
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
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
  | 'AI_REQUEST_FAILED';

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
