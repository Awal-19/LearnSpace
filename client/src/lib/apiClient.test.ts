import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request, setAccessToken } from './apiClient';

function mockFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(null);
});

describe('apiClient', () => {
  it('returns parsed JSON on success', async () => {
    mockFetch(new Response(JSON.stringify({ status: 'ok' }), { status: 200 }));
    await expect(request('/health')).resolves.toEqual({ status: 'ok' });
  });

  it('returns undefined for 204', async () => {
    mockFetch(new Response(null, { status: 204 }));
    await expect(request('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('parses the error envelope into ApiError', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: [{ path: 'email', message: 'Invalid email' }],
            requestId: 'req-1',
          },
        }),
        { status: 400 },
      ),
    );
    await expect(request('/auth/signup', { method: 'POST', body: {} })).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      code: 'VALIDATION_ERROR',
      requestId: 'req-1',
    });
  });

  it('wraps network failures as ApiError(NETWORK_ERROR)', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    const error = await request('/health').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('NETWORK_ERROR');
  });

  it('survives non-JSON error bodies', async () => {
    mockFetch(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(request('/health')).rejects.toMatchObject({ status: 502, code: 'UNKNOWN' });
  });

  it('attaches the bearer token, but not when auth is false', async () => {
    setAccessToken('tok123');
    const fn = mockFetch(new Response('{}', { status: 200 }));
    await request('/users/me');
    await request('/health', { auth: false });
    const calls = fn.mock.calls as unknown as [string, RequestInit][];
    expect((calls[0]?.[1].headers as Record<string, string>).Authorization).toBe('Bearer tok123');
    expect((calls[1]?.[1].headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('sends credentials and the CSRF guard header for cookie endpoints', async () => {
    const fn = mockFetch(new Response('{}', { status: 200 }));
    await request('/auth/refresh', { method: 'POST', cookie: true, auth: false });
    const init = (fn.mock.calls as unknown as [string, RequestInit][])[0]?.[1];
    expect(init?.credentials).toBe('include');
    expect((init?.headers as Record<string, string>)['X-Requested-With']).toBe('learnspace');
  });

  it('parses Retry-After header on 429 RATE_LIMITED responses', async () => {
    mockFetch(
      new Response(
        JSON.stringify({
          error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
        }),
        { status: 429, headers: { 'Retry-After': '15' } },
      ),
    );
    await expect(request('/documents')).rejects.toMatchObject({
      status: 429,
      code: 'RATE_LIMITED',
      retryAfterSeconds: 15,
    });
  });
});
