export type LLMContentPart =
  { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string | LLMContentPart[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export type LLMChunk =
  { type: 'delta'; text: string } | { type: 'usage'; inputTokens: number; outputTokens: number };

export interface StreamOptions {
  systemPrompt: string;
  signal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface GenerateTextOptions {
  systemPrompt?: string;
  signal?: AbortSignal;
  temperature?: number;
  maxOutputTokens?: number;
  responseMimeType?: 'text/plain' | 'application/json';
}

export interface LLMProvider {
  readonly modelName: string;
  isConfigured(): boolean;
  stream(messages: LLMMessage[], opts: StreamOptions): AsyncIterable<LLMChunk>;
  generateText(
    prompt: string,
    opts?: GenerateTextOptions,
  ): Promise<{ text: string; usage?: TokenUsage }>;
}
