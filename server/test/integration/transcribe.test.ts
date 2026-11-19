import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { createLogger } from '../../src/lib/logger';
import { signAccessToken } from '../../src/lib/tokens';
import type { AiService } from '../../src/modules/ai/ai.service';
import { createTranscribeService } from '../../src/modules/ai/transcribe.service';
import { testEnv } from '../helpers';

const VALID_WEBM_HEADER = Buffer.from([
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01,
]);

function makeTranscribeApp(opts?: {
  verified?: boolean;
  todayCount?: number;
  convertedDuration?: number;
  providerShouldThrow?: boolean;
}) {
  const env = testEnv({
    JWT_SECRET: '9f8e7d6c5b4a32109876543210fedcba9876543210abcdef',
    NVIDIA_API_KEY: 'nvapi-test-key',
    AI_DAILY_TRANSCRIPTION_LIMIT: '5',
  });
  const logger = createLogger(env);
  const userId = randomUUID();
  const token = signAccessToken(userId, env.JWT_SECRET).token;

  const prisma = {
    user: {
      findUnique: async () => ({
        id: userId,
        emailVerified: opts?.verified ?? true,
        status: 'active',
        tokensValidAfter: null,
      }),
    },
    appSettings: { findUnique: async () => null },
    aiUsageDaily: {
      findUnique: async () => null,
      aggregate: async () => ({ _sum: { inputTokens: 0, outputTokens: 0 } }),
      upsert: async () => ({}),
    },
    message: { count: async () => 0 },
    usageEvent: {
      count: async () => opts?.todayCount ?? 0,
      aggregate: async () => ({ _sum: { costUsd: 0 } }),
      create: async () => ({}),
    },
  } as unknown as PrismaClient;

  const transcribe = createTranscribeService({
    prisma,
    env,
    logger,
    convertAudio: async () => ({
      wavBuffer: Buffer.alloc(44 + 32000),
      durationSeconds: opts?.convertedDuration ?? 4,
    }),
    providerOverride: async () => {
      if (opts?.providerShouldThrow) {
        throw new Error('upstream gRPC timeout');
      }
      return 'x squared plus two x equals eight';
    },
  });

  const app = createApp(
    env,
    {
      checkDb: async () => undefined,
      dashboardPrisma: prisma,
      ai: {
        service: {} as AiService,
        transcribe,
        isEmailVerified: async () => opts?.verified ?? true,
      },
    },
    logger,
  );

  return { app, token };
}

describe('POST /api/v1/ai/transcribe', () => {
  it('rejects unauthenticated requests with 401', async () => {
    const { app } = makeTranscribeApp();
    const res = await request(app)
      .post('/api/v1/ai/transcribe')
      .attach('audio', VALID_WEBM_HEADER, 'voice.webm');
    expect(res.status).toBe(401);
  });

  it('rejects unverified email accounts with 403', async () => {
    const { app, token } = makeTranscribeApp({ verified: false });
    const res = await request(app)
      .post('/api/v1/ai/transcribe')
      .set('Authorization', `Bearer ${token}`)
      .attach('audio', VALID_WEBM_HEADER, 'voice.webm');
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('transcribes valid audio and returns { text, language, duration }', async () => {
    const { app, token } = makeTranscribeApp();
    const res = await request(app)
      .post('/api/v1/ai/transcribe')
      .set('Authorization', `Bearer ${token}`)
      .field('language', 'en-GH')
      .field('durationSeconds', '4')
      .field('hints', 'Calculus, Linear Algebra')
      .attach('audio', VALID_WEBM_HEADER, 'voice.webm');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      text: 'x squared plus two x equals eight',
      language: 'en-GH',
      duration: 4,
    });
  });

  it('rejects non-audio / spoofed magic bytes with 415', async () => {
    const { app, token } = makeTranscribeApp();
    const fakePng = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const res = await request(app)
      .post('/api/v1/ai/transcribe')
      .set('Authorization', `Bearer ${token}`)
      .attach('audio', fakePng, 'spoof.webm');
    expect(res.status).toBe(415);
  });

  it('rejects uploads larger than 10 MB with 413', async () => {
    const { app, token } = makeTranscribeApp();
    const oversized = Buffer.concat([VALID_WEBM_HEADER, Buffer.alloc(10 * 1024 * 1024 + 100)]);
    const res = await request(app)
      .post('/api/v1/ai/transcribe')
      .set('Authorization', `Bearer ${token}`)
      .attach('audio', oversized, 'huge.webm');
    expect(res.status).toBe(413);
  });

  it('rejects recordings longer than 120 seconds with 400', async () => {
    const { app, token } = makeTranscribeApp({ convertedDuration: 135 });
    const res = await request(app)
      .post('/api/v1/ai/transcribe')
      .set('Authorization', `Bearer ${token}`)
      .field('durationSeconds', '135')
      .attach('audio', VALID_WEBM_HEADER, 'long.webm');
    expect(res.status).toBe(400);
  });

  it('enforces daily transcription quota with 429', async () => {
    const { app, token } = makeTranscribeApp({ todayCount: 5 });
    const res = await request(app)
      .post('/api/v1/ai/transcribe')
      .set('Authorization', `Bearer ${token}`)
      .attach('audio', VALID_WEBM_HEADER, 'voice.webm');
    expect(res.status).toBe(429);
  });

  it('returns friendly 503 error without leaking internals on provider failure', async () => {
    const { app, token } = makeTranscribeApp({ providerShouldThrow: true });
    const res = await request(app)
      .post('/api/v1/ai/transcribe')
      .set('Authorization', `Bearer ${token}`)
      .attach('audio', VALID_WEBM_HEADER, 'voice.webm');
    expect(res.status).toBe(503);
    expect(res.body.error?.message).toMatch(/temporarily unavailable/i);
    expect(JSON.stringify(res.body)).not.toContain('upstream gRPC timeout');
  });
});
