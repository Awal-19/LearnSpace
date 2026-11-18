import { loadEnv, type Env } from '../src/config/env';

export const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/learnspace_test?schema=public',
  JWT_SECRET: 'test-secret-test-secret-test-secret-123',
  CLIENT_URL: 'http://localhost:5173',
  LOG_LEVEL: 'silent',
} as const;

export function testEnv(overrides: Record<string, string | undefined> = {}): Env {
  return loadEnv({ ...baseEnv, ...overrides });
}
