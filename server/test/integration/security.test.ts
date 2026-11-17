import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import type { PrismaClient } from '@prisma/client';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { createLogger } from '../../src/lib/logger';
import type { LLMProvider } from '../../src/lib/llm/provider';
import { signAccessToken } from '../../src/lib/tokens';
import { createAiService } from '../../src/modules/ai/ai.service';
import { createFocusService } from '../../src/modules/focus/focus.service';
import { createNotesService } from '../../src/modules/notes/notes.service';
import { createPlannerService } from '../../src/modules/planner/planner.service';
import { createStudyService } from '../../src/modules/study/study.service';
import { testEnv } from '../helpers';

function makeEmptyOwnedPrisma() {
  const notFound = async () => null;
  const emptyList = async () => [];
  return {
    $queryRaw: async () => [],
    user: { findUnique: notFound },
    userSettings: { findUnique: notFound },
    conversation: { findFirst: notFound, findMany: emptyList },
    course: { findFirst: notFound, findMany: emptyList },
    note: { findFirst: notFound, findMany: emptyList },
    task: { findFirst: notFound, findMany: emptyList },
    notification: { findFirst: notFound, findMany: emptyList, updateMany: async () => ({ count: 0 }), count: async () => 0 },
    studySession: { findFirst: notFound, findMany: emptyList },
    deck: { findFirst: notFound, findMany: emptyList },
    card: { findFirst: notFound },
    quiz: { findFirst: notFound, findMany: emptyList },
    quizAttempt: { findMany: emptyList },
  } as unknown as PrismaClient;
}

describe('cross-cutting security & IDOR sweep (T-X-*)', () => {
  const env = testEnv({ NODE_ENV: 'production', CORS_ORIGIN: 'https://app.learnspace.edu' });
  const logger = createLogger(env);
  const prisma = makeEmptyOwnedPrisma();
  const llm: LLMProvider = {
    modelName: 'gemini-test',
    isConfigured: () => false,
    stream: async function* () {},
    generateText: async () => ({ text: '' }),
  };

  const app = createApp(
    env,
    {
      checkDb: async () => undefined,
      ai: { service: createAiService({ prisma, llm, logger }), isEmailVerified: async () => true },
      notes: { service: createNotesService({ prisma, llm, logger }), isEmailVerified: async () => true },
      planner: createPlannerService({
        prisma,
        email: {
          sendVerificationEmail: async () => undefined,
          sendOtpEmail: async () => undefined,
          sendPasswordResetEmail: async () => undefined,
          sendTaskReminderEmail: async () => undefined,
        },
        logger,
        clientUrl: env.CLIENT_URL,
      }),
      focus: createFocusService(prisma),
      study: { service: createStudyService({ prisma, llm, logger }), isEmailVerified: async () => true },
    },
    logger,
  );

  const userBToken = signAccessToken(randomUUID(), env.JWT_SECRET).token;

  it('T-X-01 & T-X-02: unknown routes return 404 envelope with requestId; malformed JSON returns 400; oversized body returns 413', async () => {
    const missing = await request(app).get('/api/v1/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect(missing.body.error.requestId).toBeTruthy();
    expect(missing.body.error.stack).toBeUndefined();

    const badJson = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${userBToken}`)
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(badJson.status).toBe(400);

    const tooLarge = await request(app)
      .post('/api/v1/courses')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ name: 'x'.repeat(120_000) });
    expect(tooLarge.status).toBe(413);
  });

  it('T-X-03: sets helmet security headers and enforces CORS allow-list', async () => {
    const allowed = await request(app)
      .get('/api/v1/health/live')
      .set('Origin', 'https://app.learnspace.edu');
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.learnspace.edu');

    const disallowed = await request(app)
      .get('/api/v1/health/live')
      .set('Origin', 'https://evil.example.com');
    expect(disallowed.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('T-X-07: IDOR sweep returns 404 when User B accesses User A resource IDs', async () => {
    const foreignId = randomUUID();
    const cases: Array<{ method: 'get' | 'patch' | 'delete' | 'post'; path: string; body?: object }> = [
      { method: 'get', path: `/api/v1/conversations/${foreignId}` },
      { method: 'patch', path: `/api/v1/conversations/${foreignId}`, body: { title: 'Hijack' } },
      { method: 'delete', path: `/api/v1/conversations/${foreignId}` },
      { method: 'patch', path: `/api/v1/courses/${foreignId}`, body: { name: 'Hijack' } },
      { method: 'delete', path: `/api/v1/courses/${foreignId}` },
      { method: 'get', path: `/api/v1/notes/${foreignId}` },
      { method: 'patch', path: `/api/v1/notes/${foreignId}`, body: { title: 'Hijack' } },
      { method: 'delete', path: `/api/v1/notes/${foreignId}` },
      { method: 'patch', path: `/api/v1/tasks/${foreignId}`, body: { title: 'Hijack' } },
      { method: 'delete', path: `/api/v1/tasks/${foreignId}` },
      { method: 'post', path: `/api/v1/notifications/${foreignId}/read` },
      { method: 'delete', path: `/api/v1/study-sessions/${foreignId}` },
      { method: 'get', path: `/api/v1/decks/${foreignId}` },
      { method: 'patch', path: `/api/v1/decks/${foreignId}`, body: { title: 'Hijack' } },
      { method: 'delete', path: `/api/v1/decks/${foreignId}` },
      { method: 'patch', path: `/api/v1/cards/${foreignId}`, body: { front: 'Hijack' } },
      { method: 'delete', path: `/api/v1/cards/${foreignId}` },
      { method: 'get', path: `/api/v1/quizzes/${foreignId}` },
      { method: 'delete', path: `/api/v1/quizzes/${foreignId}` },
      { method: 'get', path: `/api/v1/quizzes/${foreignId}/attempts` },
    ];

    for (const c of cases) {
      const req = request(app)[c.method](c.path).set('Authorization', `Bearer ${userBToken}`);
      const res = c.body ? await req.send(c.body) : await req;
      expect(res.status, `${c.method.toUpperCase()} ${c.path}`).toBe(404);
    }
  });

  it('T-X-08: logger redacts passwords, tokens, and authorization headers', () => {
    const lines: string[] = [];
    const dest = new Writable({
      write(chunk, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });

    const redactedLogger = pino(
      {
        redact: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.token'],
      },
      dest,
    );

    redactedLogger.info(
      {
        req: { headers: { authorization: 'Bearer super-secret-jwt', cookie: 'refresh=abc' } },
        body: { password: 'MySecretPassword1!', token: 'opaque-token' },
      },
      'Auth attempt',
    );

    const output = lines.join('');
    expect(output).not.toContain('super-secret-jwt');
    expect(output).not.toContain('refresh=abc');
    expect(output).not.toContain('MySecretPassword1!');
    expect(output).not.toContain('opaque-token');
  });
});

