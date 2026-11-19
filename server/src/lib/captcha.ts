import type { Env } from '../config/env';
import { AppError } from './errors';

interface SiteVerifyResponse {
  success?: boolean;
}

/**
 * Verifies a Cloudflare Turnstile or hCaptcha token when a secret key is configured.
 * No-ops when neither TURNSTILE_SECRET_KEY nor HCAPTCHA_SECRET_KEY is set.
 */
export async function verifyCaptchaToken(
  env: Pick<Env, 'TURNSTILE_SECRET_KEY' | 'HCAPTCHA_SECRET_KEY' | 'NODE_ENV'>,
  token: string | undefined,
  remoteIp: string | undefined,
): Promise<void> {
  const secret = env.TURNSTILE_SECRET_KEY ?? env.HCAPTCHA_SECRET_KEY;
  if (!secret || env.NODE_ENV === 'test') return;

  if (!token || !token.trim()) {
    throw new AppError('VALIDATION_ERROR', 'Please complete the bot verification check');
  }

  const endpoint = env.TURNSTILE_SECRET_KEY
    ? 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
    : 'https://api.hcaptcha.com/siteverify';

  const body = new URLSearchParams({
    secret,
    response: token.trim(),
    ...(remoteIp ? { remoteip: remoteIp } : {}),
  });

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      throw new AppError('VALIDATION_ERROR', 'Bot verification failed. Please try again.');
    }
    const data = (await res.json()) as SiteVerifyResponse;
    if (!data.success) {
      throw new AppError('VALIDATION_ERROR', 'Bot verification failed. Please try again.');
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'VALIDATION_ERROR',
      'Bot verification could not be completed. Please try again.',
    );
  }
}
