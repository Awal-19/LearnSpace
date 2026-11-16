import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { AppError } from '../../src/lib/errors';
import type { LLMChunk, LLMProvider } from '../../src/lib/llm/provider';
import { createLogger } from '../../src/lib/logger';
import { signAccessToken } from '../../src/lib/tokens';
import { createAiService, DAILY_TOKEN_LIMIT } from '../../src/modules/ai/ai.service';
import { testEnv } from '../helpers';

interface ConvRow {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MsgRow {
  id: string;
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  status: 'complete' | 'partial' | 'error';
  action: 'explain_simple' | 'example' | 'quiz_me' | 'summarize' | null;
  inputTokens: number | null;
  outputTokens: number | null;
  model: string | null;
  createdAt: Date;
}

interface UsageRow {
  userId: string;
  day: string;
  inputTokens: number;
  outputTokens: number;
  requests: number;
}

function makeFakePrisma() {
  const users = new Map<string, { id: string; emailVerified: boolean }>();
  const conversations = new Map<string, ConvRow>();
  const messages: MsgRow[] = [];
  const usageDaily = new Map<string, UsageRow>();
  let seq = 0;

  const prisma = {
    $transaction: async <T>(ops: Array<Promise<T>>) => Promise.all(ops),
    conversation: {
      findMany: async ({
        where,
        take,
      }: {
        where: { userId: string; title?: { contains: string } };
        take: number;
      }) => {
        const q = where.title?.contains.toLowerCase();
        return Array.from(conversations.values())
          .filter((c) => c.userId === where.userId && (!q || c.title.toLowerCase().includes(q)))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, take);
      },
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const c = conversations.get(where.id);
        return c && c.userId === where.userId ? c : null;
      },
      create: async ({ data }: { data: { userId: string; title: string } }) => {
        const row: ConvRow = {
          id: randomUUID(),
          userId: data.userId,
          title: data.title,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        conversations.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<ConvRow> }) => {
        const c = conversations.get(where.id)!;
        Object.assign(c, data);
        return c;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const c = conversations.get(where.id)!;
        conversations.delete(where.id);
        return c;
      },
    },
    message: {
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where: { conversationId: string; status?: { not: string } };
        orderBy?: { createdAt: 'asc' | 'desc' };
        take?: number;
      }) => {
        let rows = messages.filter(
          (m) =>
            m.conversationId === where.conversationId &&
            (!where.status || m.status !== where.status.not),
        );
        if (orderBy?.createdAt === 'desc') {
          rows = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        } else {
          rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        return take ? rows.slice(0, take) : rows;
      },
      findFirst: async () => null,
      create: async ({ data }: { data: Partial<MsgRow> & { conversationId: string; userId: string; role: 'user' | 'assistant'; content: string } }) => {
        seq += 1;
        const row: MsgRow = {
          id: randomUUID(),
          conversationId: data.conversationId,
          userId: data.userId,
          role: data.role,
          content: data.content,
          status: data.status ?? 'complete',
          action: data.action ?? null,
          inputTokens: data.inputTokens ?? null,
          outputTokens: data.outputTokens ?? null,
          model: data.model ?? null,
          createdAt: new Date(Date.now() + seq),
        };
        messages.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<MsgRow> }) => {
        const m = messages.find((item) => item.id === where.id)!;
        Object.assign(m, data);
        return m;
      },
    },
    aiUsageDaily: {
      findUnique: async ({ where }: { where: { userId_day: { userId: string; day: Date } } }) => {
        const key = `${where.userId_day.userId}:${where.userId_day.day.toISOString().slice(0, 10)}`;
        return usageDaily.get(key) ?? null;
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { userId_day: { userId: string; day: Date } };
        create: { userId: string; day: Date; inputTokens: number; outputTokens: number; requests: number };
        update: {
          inputTokens: { increment: number };
          outputTokens: { increment: number };
          requests: { increment: number };
        };
      }) => {
        const dayStr = where.userId_day.day.toISOString().slice(0, 10);
        const key = `${where.userId_day.userId}:${dayStr}`;
        const existing = usageDaily.get(key);
        if (existing) {
          existing.inputTokens += update.inputTokens.increment;
          existing.outputTokens += update.outputTokens.increment;
          existing.requests += update.requests.increment;
          return existing;
        }
        const row: UsageRow = {
          userId: create.userId,
          day: dayStr,
          inputTokens: create.inputTokens,
          outputTokens: create.outputTokens,
          requests: create.requests,
        };
        usageDaily.set(key, row);
        return row;
      },
    },
  };

  return {
    prisma: prisma as unknown as PrismaClient,
    users,
    conversations,
    messages,
    usageDaily,
  };
}

describe('AI assistant integration (/api/v1/conversations & /api/v1/ai/usage)', () => {
  const env = testEnv();
  const logger = createLogger(env);
  let db: ReturnType<typeof makeFakePrisma>;
  let configured: boolean;
  let streamImpl: () => AsyncIterable<LLMChunk>;
  let app: ReturnType<typeof createApp>;
  let userId: string;
  let otherUserId: string;
  let token: string;
  let otherToken: string;

  beforeEach(() => {
    db = makeFakePrisma();
    configured = true;
    streamImpl = async function* () {
      yield { type: 'delta', text: 'Recursion is ' };
      yield { type: 'delta', text: 'a function calling itself.' };
      yield { type: 'usage', inputTokens: 50, outputTokens: 20 };
    };

    const llm: LLMProvider = {
      modelName: 'gemini-test',
      isConfigured: () => configured,
      stream: () => streamImpl(),
      generateText: async () => ({ text: 'ok' }),
    };

    const ai = createAiService({ prisma: db.prisma, llm, logger });
    app = createApp(
      env,
      {
        checkDb: async () => undefined,
        ai: {
          service: ai,
          isEmailVerified: async (uid) => Boolean(db.users.get(uid)?.emailVerified),
        },
      },
      logger,
    );

    userId = randomUUID();
    otherUserId = randomUUID();
    db.users.set(userId, { id: userId, emailVerified: true });
    db.users.set(otherUserId, { id: otherUserId, emailVerified: true });
    token = signAccessToken(userId, env.JWT_SECRET).token;
    otherToken = signAccessToken(otherUserId, env.JWT_SECRET).token;
  });

  it('T-AI-01: creates, lists, renames, deletes conversations and isolates users with 404', async () => {
    const created = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(created.status).toBe(201);
    expect(created.body.title).toBe('New chat');
    const convId = created.body.id as string;

    const otherGet = await request(app)
      .get(`/api/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(otherGet.status).toBe(404);

    const renamed = await request(app)
      .patch(`/api/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Algorithms' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.title).toBe('Algorithms');

    const list = await request(app)
      .get('/api/v1/conversations?q=Algo')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);

    const del = await request(app)
      .delete(`/api/v1/conversations/${convId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);
  });

  it('T-AI-02: streams meta, delta, done SSE events, persists messages, auto-titles, and records usage', async () => {
    const created = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const convId = created.body.id as string;

    const res = await request(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Explain recursion' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: meta');
    expect(res.text).toContain('event: delta');
    expect(res.text).toContain('Recursion is ');
    expect(res.text).toContain('event: done');
    expect(res.text).toContain('Explain recursion');

    expect(db.messages).toHaveLength(2);
    expect(db.messages[1]?.status).toBe('complete');
    expect(db.messages[1]?.content).toBe('Recursion is a function calling itself.');

    const usageRes = await request(app)
      .get('/api/v1/ai/usage')
      .set('Authorization', `Bearer ${token}`);
    expect(usageRes.status).toBe(200);
    expect(usageRes.body.tokensUsed).toBe(70);
    expect(usageRes.body.tokenLimit).toBe(DAILY_TOKEN_LIMIT);
  });

  it('T-AI-03: mid-stream error emits error event and saves partial assistant message', async () => {
    const created = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const convId = created.body.id as string;

    streamImpl = async function* () {
      yield { type: 'delta', text: 'Partial answer...' };
      throw new AppError('AI_PROVIDER_ERROR', 'Upstream reset');
    };

    const res = await request(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Explain heaps' });

    expect(res.status).toBe(200);
    expect(res.text).toContain('event: error');
    expect(res.text).toContain('AI_PROVIDER_ERROR');
    expect(db.messages[1]?.status).toBe('partial');
    expect(db.messages[1]?.content).toBe('Partial answer...');
  });

  it('T-AI-05 & T-AI-06: rejects unverified email (403), missing key (503), and exceeded budget (429)', async () => {
    const created = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    const convId = created.body.id as string;

    db.users.get(userId)!.emailVerified = false;
    const unverifiedRes = await request(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Hello' });
    expect(unverifiedRes.status).toBe(403);
    expect(unverifiedRes.body.error.code).toBe('EMAIL_NOT_VERIFIED');

    db.users.get(userId)!.emailVerified = true;
    configured = false;
    const unavailableRes = await request(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Hello' });
    expect(unavailableRes.status).toBe(503);
    expect(unavailableRes.body.error.code).toBe('AI_UNAVAILABLE');

    configured = true;
    const todayStr = new Date().toISOString().slice(0, 10);
    db.usageDaily.set(`${userId}:${todayStr}`, {
      userId,
      day: todayStr,
      inputTokens: DAILY_TOKEN_LIMIT,
      outputTokens: 0,
      requests: 10,
    });
    const budgetRes = await request(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Hello' });
    expect(budgetRes.status).toBe(429);
    expect(budgetRes.body.error.code).toBe('AI_BUDGET_EXCEEDED');
  });
});

