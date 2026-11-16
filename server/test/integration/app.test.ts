import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp, type AppDeps } from '../../src/app';
import { testEnv } from '../helpers';

const okDeps: AppDeps = { checkDb: async () => undefined };

function makeApp(overrides: Record<string, string | undefined> = {}, deps: AppDeps = okDeps) {
  return createApp(testEnv(overrides), deps);
}

describe('health endpoints', () => {
  it('GET /api/v1/health returns ok', async () => {
    const res = await request(makeApp()).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/health/ready is ok when the database answers', async () => {
    const res = await request(makeApp()).get('/api/v1/health/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/health/ready returns 503 when the database is down (T-X-06)', async () => {
    const app = makeApp(
      {},
      {
        checkDb: async () => {
          throw new Error('connection refused');
        },
      },
    );
    const res = await request(app).get('/api/v1/health/ready');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable' });
  });
});

describe('global behaviour (T-X-02, T-X-03)', () => {
  it('returns a JSON 404 envelope for unknown routes', async () => {
    const res = await request(makeApp()).get('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('returns 400 VALIDATION_ERROR for malformed JSON', async () => {
    const res = await request(makeApp())
      .post('/api/v1/nope')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 413 PAYLOAD_TOO_LARGE for oversized bodies', async () => {
    const res = await request(makeApp())
      .post('/api/v1/nope')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: 'x'.repeat(200_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(makeApp()).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('allows the configured origin with credentials', async () => {
    const res = await request(makeApp())
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not grant CORS to other origins', async () => {
    const res = await request(makeApp()).get('/api/v1/health').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers preflight for allowed origins', async () => {
    const res = await request(makeApp())
      .options('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-requested-with');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toMatch(/X-Requested-With/i);
  });

  it('rate limits with the standard envelope and Retry-After', async () => {
    const app = makeApp({ RATE_LIMIT_GLOBAL_PER_MIN: '3' });
    for (let i = 0; i < 3; i += 1) {
      const ok = await request(app).get('/api/v1/nope');
      expect(ok.status).toBe(404);
    }
    const limited = await request(app).get('/api/v1/nope');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.headers['retry-after']).toBeDefined();
  });

  it('does not rate limit health checks', async () => {
    const app = makeApp({ RATE_LIMIT_GLOBAL_PER_MIN: '1' });
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
    }
  });
});

