import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError, ERROR_STATUS } from '../../src/lib/errors';
import { errorHandler } from '../../src/middleware/errorHandler';
import { requestId } from '../../src/middleware/requestId';
import { asyncHandler, validate } from '../../src/middleware/validate';

function appWith(setup: (app: express.Express) => void) {
  const app = express();
  app.use(requestId);
  app.use(express.json());
  setup(app);
  app.use(errorHandler);
  return app;
}

describe('errorHandler (T-X-01)', () => {
  it('never leaks the message or stack of unexpected errors', async () => {
    const app = appWith((a) =>
      a.get('/boom', () => {
        throw new Error('db password is hunter2');
      }),
    );
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL');
    expect(res.body.error.requestId).toBe(res.headers['x-request-id']);
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(JSON.stringify(res.body)).not.toContain('at ');
  });

  it('catches rejected promises from async handlers', async () => {
    const app = appWith((a) =>
      a.get(
        '/async',
        asyncHandler(async () => {
          throw new AppError('CONFLICT', 'Course already exists');
        }),
      ),
    );
    const res = await request(app).get('/async');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'CONFLICT', message: 'Course already exists' });
  });

  it('maps every ErrorCode to the status documented in API.md', () => {
    expect(ERROR_STATUS.VALIDATION_ERROR).toBe(400);
    expect(ERROR_STATUS.UNAUTHENTICATED).toBe(401);
    expect(ERROR_STATUS.ACCOUNT_LOCKED).toBe(423);
    expect(ERROR_STATUS.RATE_LIMITED).toBe(429);
    expect(ERROR_STATUS.AI_UNAVAILABLE).toBe(503);
  });
});

describe('validate middleware', () => {
  const schema = z.object({ title: z.string().trim().min(1).max(10) }).strict();
  const app = appWith((a) =>
    a.post('/items', validate({ body: schema }), (req, res) => {
      res.status(201).json(req.body);
    }),
  );

  it('passes parsed (trimmed) data through', async () => {
    const res = await request(app).post('/items').send({ title: '  hello  ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ title: 'hello' });
  });

  it('returns field-level details on failure', async () => {
    const res = await request(app).post('/items').send({ title: '', extra: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'title' })]),
    );
  });
});

describe('requestId middleware', () => {
  const app = appWith((a) => a.get('/ok', (req, res) => res.json({ id: req.requestId })));

  it('generates an id when none is supplied', async () => {
    const res = await request(app).get('/ok');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.id).toBe(res.headers['x-request-id']);
  });

  it('honours a well-formed incoming id', async () => {
    const res = await request(app).get('/ok').set('X-Request-Id', 'abc-12345678');
    expect(res.headers['x-request-id']).toBe('abc-12345678');
  });

  it('replaces a malformed incoming id', async () => {
    const res = await request(app).get('/ok').set('X-Request-Id', 'bad id with spaces!');
    expect(res.headers['x-request-id']).not.toBe('bad id with spaces!');
  });
});

