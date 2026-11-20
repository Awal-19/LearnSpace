import type { Env } from '../config/env';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

export interface WebSearchOptions {
  maxResults?: number;
  excludeDomains?: string[];
  includeDomains?: string[];
  signal?: AbortSignal;
}

export interface WebSearchResponse {
  provider: 'tavily' | 'brave' | 'serper' | 'none';
  results: WebSearchResult[];
  estimatedCostUsd: number;
}

export interface WebSearchProvider {
  readonly name: 'tavily' | 'brave' | 'serper' | 'none';
  isConfigured(): boolean;
  search(query: string, options?: WebSearchOptions): Promise<WebSearchResponse>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

function extractDomainSafe(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function fetchWithTimeoutAndRetry(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const parentSignal = init.signal;
    const onParentAbort = () => controller.abort();
    if (parentSignal) {
      if (parentSignal.aborted) controller.abort();
      else parentSignal.addEventListener('abort', onParentAbort, { once: true });
    }

    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (res.status >= 500 || res.status === 429) {
        lastError = new Error(`Search provider HTTP ${res.status}`);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastError = err;
      if (parentSignal?.aborted || attempt >= MAX_RETRIES) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 400 * Math.pow(2, attempt)));
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', onParentAbort);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Search request failed');
}

export function createTavilyProvider(apiKey: string): WebSearchProvider {
  return {
    name: 'tavily',
    isConfigured: () => Boolean(apiKey.trim()),
    async search(query, options) {
      const res = await fetchWithTimeoutAndRetry('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: options?.signal,
        body: JSON.stringify({
          api_key: apiKey,
          query,
          search_depth: 'basic',
          max_results: Math.min(options?.maxResults ?? 8, 10),
          include_answer: false,
          include_raw_content: false,
          ...(options?.excludeDomains?.length ? { exclude_domains: options.excludeDomains } : {}),
          ...(options?.includeDomains?.length ? { include_domains: options.includeDomains } : {}),
        }),
      });
      if (!res.ok) {
        throw new Error(`Tavily search failed with status ${res.status}`);
      }
      const data = (await res.json()) as {
        results?: Array<{ title?: string; url?: string; content?: string }>;
      };
      const results: WebSearchResult[] = (data.results ?? [])
        .filter((r) => typeof r.url === 'string' && r.url.startsWith('http'))
        .map((r) => ({
          title: (r.title ?? '').trim().slice(0, 240),
          url: r.url!.trim(),
          snippet: (r.content ?? '').trim().slice(0, 800),
          domain: extractDomainSafe(r.url!),
        }));
      return { provider: 'tavily', results, estimatedCostUsd: 0.004 };
    },
  };
}

export function createBraveProvider(apiKey: string): WebSearchProvider {
  return {
    name: 'brave',
    isConfigured: () => Boolean(apiKey.trim()),
    async search(query, options) {
      const params = new URLSearchParams({
        q: query,
        count: String(Math.min(options?.maxResults ?? 8, 10)),
        safesearch: 'moderate',
      });
      const res = await fetchWithTimeoutAndRetry(
        `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Subscription-Token': apiKey,
          },
          signal: options?.signal,
        },
      );
      if (!res.ok) {
        throw new Error(`Brave search failed with status ${res.status}`);
      }
      const data = (await res.json()) as {
        web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
      };
      const results: WebSearchResult[] = (data.web?.results ?? [])
        .filter((r) => typeof r.url === 'string' && r.url.startsWith('http'))
        .map((r) => ({
          title: (r.title ?? '').trim().slice(0, 240),
          url: r.url!.trim(),
          snippet: (r.description ?? '').trim().slice(0, 800),
          domain: extractDomainSafe(r.url!),
        }));
      return { provider: 'brave', results, estimatedCostUsd: 0.005 };
    },
  };
}

export function createSerperProvider(apiKey: string): WebSearchProvider {
  return {
    name: 'serper',
    isConfigured: () => Boolean(apiKey.trim()),
    async search(query, options) {
      const res = await fetchWithTimeoutAndRetry('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': apiKey,
        },
        signal: options?.signal,
        body: JSON.stringify({
          q: query,
          num: Math.min(options?.maxResults ?? 8, 10),
        }),
      });
      if (!res.ok) {
        throw new Error(`Serper search failed with status ${res.status}`);
      }
      const data = (await res.json()) as {
        organic?: Array<{ title?: string; link?: string; snippet?: string }>;
      };
      const results: WebSearchResult[] = (data.organic ?? [])
        .filter((r) => typeof r.link === 'string' && r.link.startsWith('http'))
        .map((r) => ({
          title: (r.title ?? '').trim().slice(0, 240),
          url: r.link!.trim(),
          snippet: (r.snippet ?? '').trim().slice(0, 800),
          domain: extractDomainSafe(r.link!),
        }));
      return { provider: 'serper', results, estimatedCostUsd: 0.001 };
    },
  };
}

export function createNoopSearchProvider(): WebSearchProvider {
  return {
    name: 'none',
    isConfigured: () => false,
    async search() {
      return { provider: 'none', results: [], estimatedCostUsd: 0 };
    },
  };
}

export function createWebSearchProvider(
  env: Pick<Env, 'SEARCH_PROVIDER' | 'TAVILY_API_KEY' | 'BRAVE_SEARCH_API_KEY' | 'SERPER_API_KEY'>,
): WebSearchProvider {
  const mode = env.SEARCH_PROVIDER ?? 'auto';
  if (mode === 'none') return createNoopSearchProvider();
  if (mode === 'tavily') {
    return env.TAVILY_API_KEY
      ? createTavilyProvider(env.TAVILY_API_KEY)
      : createNoopSearchProvider();
  }
  if (mode === 'brave') {
    return env.BRAVE_SEARCH_API_KEY
      ? createBraveProvider(env.BRAVE_SEARCH_API_KEY)
      : createNoopSearchProvider();
  }
  if (mode === 'serper') {
    return env.SERPER_API_KEY
      ? createSerperProvider(env.SERPER_API_KEY)
      : createNoopSearchProvider();
  }

  // auto
  if (env.TAVILY_API_KEY) return createTavilyProvider(env.TAVILY_API_KEY);
  if (env.BRAVE_SEARCH_API_KEY) return createBraveProvider(env.BRAVE_SEARCH_API_KEY);
  if (env.SERPER_API_KEY) return createSerperProvider(env.SERPER_API_KEY);
  return createNoopSearchProvider();
}
