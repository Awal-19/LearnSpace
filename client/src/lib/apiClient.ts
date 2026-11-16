/**
 * Thin fetch wrapper for the LearnSpace API.
 * - Parses the documented error envelope into ApiError.
 * - Attaches the in-memory access token (never persisted to storage).
 * - Phase 2 adds transparent refresh-and-retry on TOKEN_EXPIRED.
 */

export const API_BASE_URL: string = import.meta.env.VITE_API_URL ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
let refreshHandler: (() => Promise<boolean>) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setRefreshHandler(handler: (() => Promise<boolean>) | null): void {
  refreshHandler = handler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  /** Attach the Bearer token (default true). */
  auth?: boolean;
  /** Endpoint uses the httpOnly refresh cookie: send credentials and the CSRF guard header. */
  cookie?: boolean;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown; requestId?: string };
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return executeRequest<T>(path, options, false);
}

async function executeRequest<T>(
  path: string,
  options: RequestOptions,
  isRetry: boolean,
): Promise<T> {
  const { method = 'GET', body, signal, headers = {}, auth = true, cookie = false } = options;

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const finalHeaders: Record<string, string> = { Accept: 'application/json', ...headers };
  if (body !== undefined && !isFormData) finalHeaders['Content-Type'] = 'application/json';
  if (auth && accessToken) finalHeaders.Authorization = `Bearer ${accessToken}`;
  if (cookie) finalHeaders['X-Requested-With'] = 'learnspace';

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
      credentials: cookie ? 'include' : 'same-origin',
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection.');
  }

  if (response.status === 204) return undefined as T;

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (!response.ok) {
    const envelope = (payload ?? {}) as ErrorEnvelope;
    const code = envelope.error?.code ?? 'UNKNOWN';

    // Silent refresh on expired access token (once per request).
    if (response.status === 401 && code === 'TOKEN_EXPIRED' && auth && !isRetry && refreshHandler) {
      const refreshed = await refreshHandler();
      if (refreshed) {
        return executeRequest<T>(path, options, true);
      }
    }

    throw new ApiError(
      response.status,
      code,
      envelope.error?.message ?? `Request failed (${response.status})`,
      envelope.error?.details,
      envelope.error?.requestId,
    );
  }

  return payload as T;
}

