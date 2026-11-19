import pino, { type Logger } from 'pino';
import type { Env } from '../config/env';

/** Paths removed from every log line (SECURITY.md T12). */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-step-up-password"]',
  'req.headers["x-goog-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.idToken',
  '*.captchaToken',
  '*.otp',
  '*.code',
  '*.apiKey',
  '*.secret',
  '*.privateKey',
];

export function createLogger(env: Pick<Env, 'NODE_ENV' | 'LOG_LEVEL'>): Logger {
  return pino({
    level: env.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
    ...(env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { colorize: true, singleLine: true } } }
      : {}),
  });
}
