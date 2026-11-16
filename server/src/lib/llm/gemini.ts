import type { Logger } from 'pino';
import type { Env } from '../../config/env';
import { AppError } from '../errors';
import type {
  GenerateTextOptions,
  LLMChunk,
  LLMMessage,
  LLMProvider,
  StreamOptions,
  TokenUsage,
} from './provider';

const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface GeminiPart {
  text?: string;
}

interface GeminiCandidate {
  content?: { parts?: GeminiPart[] };
}

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
}

interface GeminiPayload {
  candidates?: GeminiCandidate[];
  usageMetadata?: GeminiUsageMetadata;
  error?: { message?: string; status?: string };
}

function toGeminiContents(messages: LLMMessage[]) {
  return messages.map((m) => {
    const role = m.role === 'assistant' ? 'model' : 'user';
    if (typeof m.content === 'string') {
      return { role, parts: [{ text: m.content }] };
    }
    const parts = m.content.map((part) => {
      if (part.type === 'text') return { text: part.text };
      const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
      if (match && match[1] && match[2]) {
        return { inlineData: { mimeType: match[1], data: match[2] } };
      }
      return { text: '[Attached image]' };
    });
    return { role, parts };
  });
}

/**
 * Gemini REST API provider using native fetch() + SSE parsing.
 * API key is sent in the x-goog-api-key header (never in URL query params).
 */
export function createGeminiProvider(
  env: Env,
  logger: Logger,
  modelName: string = DEFAULT_GEMINI_MODEL,
): LLMProvider {
  const apiKey = env.GEMINI_API_KEY;

  return {
    modelName,

    isConfigured(): boolean {
      return Boolean(apiKey);
    },

    async *stream(messages: LLMMessage[], opts: StreamOptions): AsyncIterable<LLMChunk> {
      if (!apiKey) {
        throw new AppError('AI_UNAVAILABLE', 'AI tutor is not configured right now');
      }

      const url = `${GEMINI_BASE_URL}/${encodeURIComponent(modelName)}:streamGenerateContent?alt=sse`;
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: opts.systemPrompt }] },
            contents: toGeminiContents(messages),
            generationConfig: {
              temperature: opts.temperature ?? 0.6,
              maxOutputTokens: opts.maxOutputTokens ?? 2048,
            },
          }),
          signal: opts.signal,
        });
      } catch (err) {
        if (opts.signal?.aborted) return;
        logger.warn({ err }, 'Gemini stream request failed');
        throw new AppError('AI_PROVIDER_ERROR', 'Could not reach the AI service');
      }

      if (!response.ok || !response.body) {
        const status = response.status;
        logger.warn({ status }, 'Gemini stream returned non-OK status');
        throw new AppError('AI_PROVIDER_ERROR', 'The AI service returned an error');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastUsage: TokenUsage | null = null;

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line.startsWith('data:')) continue;
            const jsonText = line.slice('data:'.length).trim();
            if (!jsonText || jsonText === '[DONE]') continue;

            let payload: GeminiPayload;
            try {
              payload = JSON.parse(jsonText) as GeminiPayload;
            } catch {
              continue;
            }

            if (payload.error) {
              throw new AppError('AI_PROVIDER_ERROR', payload.error.message ?? 'AI provider error');
            }

            const parts = payload.candidates?.[0]?.content?.parts ?? [];
            for (const part of parts) {
              if (part.text) {
                yield { type: 'delta', text: part.text };
              }
            }

            if (payload.usageMetadata) {
              lastUsage = {
                inputTokens: payload.usageMetadata.promptTokenCount ?? 0,
                outputTokens: payload.usageMetadata.candidatesTokenCount ?? 0,
              };
            }
          }
        }
      } catch (err) {
        if (opts.signal?.aborted) return;
        if (err instanceof AppError) throw err;
        logger.warn({ err }, 'Error reading Gemini SSE stream');
        throw new AppError('AI_PROVIDER_ERROR', 'The AI response was interrupted');
      } finally {
        reader.releaseLock();
      }

      if (lastUsage) {
        yield { type: 'usage', ...lastUsage };
      }
    },

    async generateText(prompt: string, opts: GenerateTextOptions = {}) {
      if (!apiKey) {
        throw new AppError('AI_UNAVAILABLE', 'AI service is not configured right now');
      }

      const url = `${GEMINI_BASE_URL}/${encodeURIComponent(modelName)}:generateContent`;
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
          },
          body: JSON.stringify({
            ...(opts.systemPrompt
              ? { systemInstruction: { parts: [{ text: opts.systemPrompt }] } }
              : {}),
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: opts.temperature ?? 0.4,
              maxOutputTokens: opts.maxOutputTokens ?? 2048,
              ...(opts.responseMimeType ? { responseMimeType: opts.responseMimeType } : {}),
            },
          }),
          signal: opts.signal,
        });
      } catch (err) {
        logger.warn({ err }, 'Gemini generateContent request failed');
        throw new AppError('AI_PROVIDER_ERROR', 'Could not reach the AI service');
      }

      if (!response.ok) {
        logger.warn({ status: response.status }, 'Gemini generateContent returned non-OK status');
        throw new AppError('AI_PROVIDER_ERROR', 'The AI service returned an error');
      }

      const payload = (await response.json()) as GeminiPayload;
      const text = (payload.candidates?.[0]?.content?.parts ?? [])
        .map((p) => p.text ?? '')
        .join('');

      if (!text) {
        throw new AppError('AI_BAD_OUTPUT', 'The AI returned an empty response');
      }

      const usage = payload.usageMetadata
        ? {
            inputTokens: payload.usageMetadata.promptTokenCount ?? 0,
            outputTokens: payload.usageMetadata.candidatesTokenCount ?? 0,
          }
        : undefined;

      return { text, usage };
    },
  };
}

