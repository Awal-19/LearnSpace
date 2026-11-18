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

const REQUEST_TIMEOUT_MS = 180_000;

interface OpenAIChatChunk {
  choices?: Array<{
    delta?: { content?: string | null; reasoning_content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string };
}

interface OpenAIChatResponse {
  choices?: Array<{
    message?: { content?: string | null; reasoning_content?: string | null };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
  error?: { message?: string };
}

function combineSignals(callerSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  if (!callerSignal) return timeoutSignal;
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any([callerSignal, timeoutSignal]);
  }
  return callerSignal;
}

/**
 * Z.ai GLM inference provider via NVIDIA's OpenAI-compatible endpoint
 * (https://integrate.api.nvidia.com/v1).
 */
export function createNvidiaProvider(env: Env, logger: Logger): LLMProvider {
  const apiKey = env.NVIDIA_API_KEY;
  const baseUrl = env.NVIDIA_BASE_URL.replace(/\/$/, '');
  const modelName = env.NVIDIA_MODEL;
  const visionModelName = env.NVIDIA_VISION_MODEL;

  return {
    modelName,

    isConfigured(): boolean {
      return Boolean(apiKey);
    },

    async *stream(messages: LLMMessage[], opts: StreamOptions): AsyncIterable<LLMChunk> {
      if (!apiKey) {
        throw new AppError('AI_UNAVAILABLE', 'AWAL AI Tutor is not configured right now');
      }

      const hasImages = messages.some(
        (m) => Array.isArray(m.content) && m.content.some((part) => part.type === 'image_url'),
      );
      const activeModel = hasImages ? visionModelName : modelName;

      const signal = combineSignals(opts.signal);
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: activeModel,
            messages: [
              { role: 'system', content: opts.systemPrompt },
              ...messages.map((m) => ({ role: m.role, content: m.content })),
            ],
            temperature: opts.temperature ?? 0.5,
            top_p: 0.95,
            max_tokens: opts.maxOutputTokens ?? 4096,
            stream: true,
            stream_options: { include_usage: true },
          }),
          signal,
        });
      } catch (err) {
        if (opts.signal?.aborted) return;
        logger.warn({ err, model: activeModel }, 'NVIDIA GLM stream request failed');
        throw new AppError('AI_PROVIDER_ERROR', 'Could not reach AWAL AI service');
      }

      if (!response.ok || !response.body) {
        logger.warn(
          { status: response.status, model: activeModel },
          'NVIDIA GLM returned non-OK status',
        );
        throw new AppError(
          response.status === 404 || response.status === 503
            ? 'AI_UNAVAILABLE'
            : 'AI_PROVIDER_ERROR',
          'AWAL is currently unavailable. Please try again shortly.',
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastUsage: TokenUsage | null = null;
      let emittedContent = false;
      let reasoningBuffer = '';

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

            let payload: OpenAIChatChunk;
            try {
              payload = JSON.parse(jsonText) as OpenAIChatChunk;
            } catch {
              continue;
            }

            if (payload.error) {
              throw new AppError('AI_PROVIDER_ERROR', payload.error.message ?? 'NVIDIA API error');
            }

            const deltaText = payload.choices?.[0]?.delta?.content;
            if (deltaText) {
              emittedContent = true;
              yield { type: 'delta', text: deltaText };
            } else {
              const reasoningDelta = payload.choices?.[0]?.delta?.reasoning_content;
              if (reasoningDelta) {
                reasoningBuffer += reasoningDelta;
              }
            }

            if (payload.usage) {
              lastUsage = {
                inputTokens: payload.usage.prompt_tokens ?? 0,
                outputTokens: payload.usage.completion_tokens ?? 0,
              };
            }
          }
        }
      } catch (err) {
        if (opts.signal?.aborted) return;
        if (err instanceof AppError) throw err;
        logger.warn({ err, model: modelName }, 'Error reading NVIDIA GLM SSE stream');
        throw new AppError('AI_PROVIDER_ERROR', 'AWAL response was interrupted');
      } finally {
        reader.releaseLock();
      }

      if (!emittedContent && reasoningBuffer.trim()) {
        yield { type: 'delta', text: reasoningBuffer.trim() };
      }

      if (lastUsage) {
        yield { type: 'usage', ...lastUsage };
      }
    },

    async generateText(prompt: string, opts: GenerateTextOptions = {}) {
      if (!apiKey) {
        throw new AppError('AI_UNAVAILABLE', 'NVIDIA AI service is not configured right now');
      }

      const signal = combineSignals(opts.signal);
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: modelName,
            messages: [
              ...(opts.systemPrompt ? [{ role: 'system', content: opts.systemPrompt }] : []),
              { role: 'user', content: prompt },
            ],
            temperature: opts.temperature ?? 0.3,
            max_tokens: opts.maxOutputTokens ?? 4096,
            ...(opts.responseMimeType === 'application/json'
              ? { response_format: { type: 'json_object' } }
              : {}),
          }),
          signal,
        });
      } catch (err) {
        logger.warn({ err, model: modelName }, 'NVIDIA generateText request failed');
        throw new AppError('AI_PROVIDER_ERROR', 'Could not reach the NVIDIA AI service');
      }

      if (!response.ok) {
        logger.warn({ status: response.status, model: modelName }, 'NVIDIA generateText non-OK');
        throw new AppError(
          response.status === 404 || response.status === 503
            ? 'AI_UNAVAILABLE'
            : 'AI_PROVIDER_ERROR',
          'The NVIDIA AI service returned an error',
        );
      }

      const payload = (await response.json()) as OpenAIChatResponse;
      const msg = payload.choices?.[0]?.message;
      const text = msg?.content?.trim() || msg?.reasoning_content?.trim() || '';
      if (!text) {
        throw new AppError('AI_BAD_OUTPUT', 'The AI returned an empty response');
      }

      const usage = payload.usage
        ? {
            inputTokens: payload.usage.prompt_tokens ?? 0,
            outputTokens: payload.usage.completion_tokens ?? 0,
          }
        : undefined;

      return { text, usage };
    },
  };
}
