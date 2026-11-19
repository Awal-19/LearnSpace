import type { Logger } from 'pino';

const SENSITIVE_KEY_RE =
  /^(authorization|cookie|set-cookie|x-step-up-password|x-goog-api-key|password|currentpassword|newpassword|token|accesstoken|refreshtoken|idtoken|captchatoken|otp|code|apikey|secret|privatekey|chatcontent)$/i;

/**
 * Recursively scrubs sensitive keys from error/telemetry payloads before external reporting.
 */
export function scrubSensitiveData(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => scrubSensitiveData(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEY_RE.test(k) ? '[REDACTED]' : scrubSensitiveData(v, depth + 1);
  }
  return out;
}

/**
 * Lightweight Sentry error reporter activated only when SENTRY_DSN is configured.
 * Scrubs all credentials, tokens, OTPs, and sensitive headers before sending.
 */
export async function reportToSentry(
  sentryDsn: string | undefined,
  err: unknown,
  context: { requestId?: string; route?: string; method?: string; userId?: string | null },
): Promise<void> {
  if (!sentryDsn) return;
  try {
    const parsed = new URL(sentryDsn);
    const projectId = parsed.pathname.replace(/^\/+/, '');
    const publicKey = parsed.username;
    if (!projectId || !publicKey) return;

    const storeUrl = `${parsed.protocol}//${parsed.host}/api/${projectId}/store/`;
    const message = err instanceof Error ? err.message : 'Internal server error';
    const stack = err instanceof Error ? err.stack : undefined;

    await fetch(storeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=learnspace-api/1.0`,
      },
      body: JSON.stringify(
        scrubSensitiveData({
          platform: 'node',
          level: 'error',
          message,
          extra: {
            requestId: context.requestId,
            route: context.route,
            method: context.method,
            stack,
          },
          user: context.userId ? { id: context.userId } : undefined,
        }),
      ),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    /* Best-effort telemetry; never block or throw */
  }
}

export type AnomalyKind = 'failed_login_ip' | 'signup_ip' | 'ai_cost_spike';

const ANOMALY_WINDOW_MS = 15 * 60 * 1000;
const ANOMALY_THRESHOLDS: Record<AnomalyKind, number> = {
  failed_login_ip: 10,
  signup_ip: 8,
  ai_cost_spike: 1,
};

const anomalyBuckets = new Map<string, number[]>();

/**
 * Tracks sliding-window security anomaly signals and emits a structured alert log
 * when suspicious thresholds are exceeded.
 */
export function recordAnomalySignal(
  logger: Pick<Logger, 'error'>,
  kind: AnomalyKind,
  key: string,
  meta: Record<string, unknown> = {},
): boolean {
  const now = Date.now();
  const bucketKey = `${kind}:${key}`;
  const existing = (anomalyBuckets.get(bucketKey) ?? []).filter(
    (ts) => now - ts < ANOMALY_WINDOW_MS,
  );
  existing.push(now);
  anomalyBuckets.set(bucketKey, existing);

  if (existing.length >= ANOMALY_THRESHOLDS[kind]) {
    logger.error(
      { securityAlert: kind, key, count: existing.length, windowMs: ANOMALY_WINDOW_MS, ...meta },
      `Security anomaly detected: ${kind}`,
    );
    return true;
  }
  return false;
}
