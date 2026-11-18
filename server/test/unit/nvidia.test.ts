import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppError } from '../../src/lib/errors';
import { createNvidiaProvider } from '../../src/lib/llm/nvidia';
import { createLogger } from '../../src/lib/logger';
import { testEnv } from '../helpers';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createNvidiaProvider', () => {
  it('reports configured state and streams OpenAI-compatible SSE chunks', async () => {
    const env = testEnv({
      NVIDIA_API_KEY: 'nvapi-test-key',
      NVIDIA_BASE_URL: 'https://integrate.api.nvidia.com/v1',
      NVIDIA_MODEL: 'z-ai/glm-5.3-flash',
    });
    const logger = createLogger(env);
    const provider = createNvidiaProvider(env, logger);

    expect(provider.isConfigured()).toBe(true);
    expect(provider.modelName).toBe('z-ai/glm-5.3-flash');

    const stream = new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"Step 1: "}}]}\n\n'));
        controller.enqueue(
          enc.encode(
            'data: {"choices":[{"delta":{"content":"Define base case."}}],"usage":{"prompt_tokens":42,"completion_tokens":15}}\n\n',
          ),
        );
        controller.enqueue(enc.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(stream, { status: 200 }));

    const chunks = [];
    for await (const chunk of provider.stream([{ role: 'user', content: 'Explain recursion' }], {
      systemPrompt: 'You are a tutor.',
    })) {
      chunks.push(chunk);
    }

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://integrate.api.nvidia.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer nvapi-test-key',
        }),
      }),
    );
    expect(chunks).toEqual([
      { type: 'delta', text: 'Step 1: ' },
      { type: 'delta', text: 'Define base case.' },
      { type: 'usage', inputTokens: 42, outputTokens: 15 },
    ]);
  });

  it('throws AI_UNAVAILABLE when NVIDIA API returns 503 or key is missing', async () => {
    const envNoKey = testEnv({ NVIDIA_API_KEY: undefined });
    const unconfigured = createNvidiaProvider(envNoKey, createLogger(envNoKey));
    expect(unconfigured.isConfigured()).toBe(false);

    const env = testEnv({ NVIDIA_API_KEY: 'nvapi-test-key' });
    const provider = createNvidiaProvider(env, createLogger(env));
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('unavailable', { status: 503 }),
    );

    await expect(provider.generateText('Hello')).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    } satisfies Partial<AppError>);
  });
});
