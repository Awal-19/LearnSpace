import { describe, expect, it } from 'vitest';
import { EnvError, loadEnv } from '../../src/config/env';
import { baseEnv, testEnv } from '../helpers';

describe('loadEnv (T-X-04)', () => {
  it('accepts a valid configuration and applies defaults', () => {
    const env = testEnv();
    expect(env.PORT).toBe(4000);
    expect(env.TRUST_PROXY).toBe(0);
    expect(env.RATE_LIMIT_GLOBAL_PER_MIN).toBe(300);
    expect(env.RESEND_API_KEY).toBeUndefined();
  });

  it('fails fast when DATABASE_URL is missing and names the variable', () => {
    expect(() => loadEnv({ ...baseEnv, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('rejects a short JWT secret without echoing its value', () => {
    const secret = 'too-short-secret';
    try {
      loadEnv({ ...baseEnv, JWT_SECRET: secret });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(EnvError);
      expect((err as Error).message).toMatch(/JWT_SECRET/);
      expect((err as Error).message).not.toContain(secret);
    }
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => loadEnv({ ...baseEnv, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
  });

  it('treats empty optional values as unset', () => {
    const env = testEnv({ GEMINI_API_KEY: '', CORS_ORIGIN: '  ' });
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173']);
  });

  it('parses a comma-separated CORS_ORIGIN and strips trailing slashes', () => {
    const env = testEnv({ CORS_ORIGIN: 'https://app.example.com/, http://localhost:5173' });
    expect(env.CORS_ORIGINS).toEqual(['https://app.example.com', 'http://localhost:5173']);
  });

  it('refuses the example JWT secret in production', () => {
    expect(() =>
      loadEnv({
        ...baseEnv,
        NODE_ENV: 'production',
        JWT_SECRET: 'change-me-dev-only-secret-at-least-32-chars',
      }),
    ).toThrow(/production/);
  });
});

