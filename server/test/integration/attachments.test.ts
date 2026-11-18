import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import type { LLMMessage, LLMProvider } from '../../src/lib/llm/provider';
import { createLogger } from '../../src/lib/logger';
import type { StorageService } from '../../src/lib/storage';
import { signAccessToken } from '../../src/lib/tokens';
import { createAiService } from '../../src/modules/ai/ai.service';
import { createAttachmentsService } from '../../src/modules/ai/attachments.service';
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
  action: null;
  createdAt: Date;
}

interface AttRow {
  id: string;
  userId: string;
  conversationId: string;
  messageId: string | null;
  originalName: string;
  mimeType: string;
  kind: 'image' | 'document';
  sizeBytes: number;
  storageKey: string;
  storageUrl: string;
  extractedText: string | null;
  truncated: boolean;
  createdAt: Date;
}

function makeFakePrisma() {
  const conversations = new Map<string, ConvRow>();
  const messages: MsgRow[] = [];
  const attachments = new Map<string, AttRow>();

  const prisma = {
    $transaction: async <T>(ops: Array<Promise<T>>) => Promise.all(ops),
    conversation: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const c = conversations.get(where.id);
        return c && c.userId === where.userId ? c : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<ConvRow> }) => {
        const c = conversations.get(where.id)!;
        Object.assign(c, data);
        return c;
      },
    },
    message: {
      findMany: async () => [],
      create: async ({
        data,
      }: {
        data: {
          conversationId: string;
          userId: string;
          role: 'user' | 'assistant';
          content: string;
        };
      }) => {
        const row: MsgRow = {
          id: randomUUID(),
          conversationId: data.conversationId,
          userId: data.userId,
          role: data.role,
          content: data.content,
          status: 'complete',
          action: null,
          createdAt: new Date(),
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
    messageAttachment: {
      count: async ({ where }: { where: { userId: string } }) =>
        Array.from(attachments.values()).filter((a) => a.userId === where.userId).length,
      create: async ({ data }: { data: Omit<AttRow, 'id' | 'messageId' | 'createdAt'> }) => {
        const row: AttRow = {
          id: randomUUID(),
          messageId: null,
          createdAt: new Date(),
          ...data,
        };
        attachments.set(row.id, row);
        return row;
      },
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const a = attachments.get(where.id);
        return a && a.userId === where.userId ? a : null;
      },
      findMany: async ({
        where,
      }: {
        where: { id?: { in: string[] }; userId?: string; conversationId?: string };
      }) =>
        Array.from(attachments.values()).filter((a) => {
          if (where.userId && a.userId !== where.userId) return false;
          if (where.conversationId && a.conversationId !== where.conversationId) return false;
          if (where.id?.in && !where.id.in.includes(a.id)) return false;
          return true;
        }),
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: { in: string[] }; userId: string };
        data: { messageId: string };
      }) => {
        let count = 0;
        for (const a of attachments.values()) {
          if (a.userId === where.userId && where.id.in.includes(a.id)) {
            a.messageId = data.messageId;
            count += 1;
          }
        }
        return { count };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const a = attachments.get(where.id)!;
        attachments.delete(where.id);
        return a;
      },
    },
    aiUsageDaily: {
      findUnique: async () => null,
      upsert: async () => ({}),
    },
  };

  return { prisma: prisma as unknown as PrismaClient, conversations, attachments };
}

describe('multimodal chat attachments integration', () => {
  const env = testEnv();
  const logger = createLogger(env);
  let db: ReturnType<typeof makeFakePrisma>;
  let storedBytes: Map<string, Buffer>;
  let capturedMessages: LLMMessage[] | null;
  let app: ReturnType<typeof createApp>;
  let userId: string;
  let otherUserId: string;
  let convId: string;
  let token: string;
  let otherToken: string;

  beforeEach(() => {
    db = makeFakePrisma();
    storedBytes = new Map();
    capturedMessages = null;

    const storage: StorageService = {
      isConfigured: () => true,
      uploadAvatar: vi.fn(),
      deleteAvatar: vi.fn(),
      uploadAttachment: vi.fn(async (buf, uid, kind, ext) => {
        const key = `att:${uid}/${randomUUID()}.${ext}`;
        storedBytes.set(key, buf);
        return { storageKey: key, storageUrl: `https://cdn.example.com/${key}` };
      }),
      getSignedAttachmentUrl: () => null,
      readAttachmentBytes: vi.fn(async (key) => storedBytes.get(key) ?? Buffer.alloc(0)),
      deleteAttachment: vi.fn(async (key) => {
        storedBytes.delete(key);
      }),
    };

    const llm: LLMProvider = {
      modelName: 'z-ai/glm-5.3-flash',
      isConfigured: () => true,
      stream: async function* (messages) {
        capturedMessages = messages;
        yield { type: 'delta', text: 'I see your attachment.' };
        yield { type: 'usage', inputTokens: 25, outputTokens: 10 };
      },
      generateText: async () => ({ text: 'ok' }),
    };

    const attachments = createAttachmentsService({ prisma: db.prisma, storage, logger });
    const ai = createAiService({ prisma: db.prisma, llm, logger, attachments, storage });
    app = createApp(
      env,
      {
        checkDb: async () => undefined,
        ai: { service: ai, isEmailVerified: async () => true },
        attachments: { service: attachments, isEmailVerified: async () => true },
      },
      logger,
    );

    userId = randomUUID();
    otherUserId = randomUUID();
    convId = randomUUID();
    db.conversations.set(convId, {
      id: convId,
      userId,
      title: 'New chat',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    token = signAccessToken(userId, env.JWT_SECRET).token;
    otherToken = signAccessToken(otherUserId, env.JWT_SECRET).token;
  });

  it('rejects unauthenticated upload (401), wrong file magic bytes (415), and oversized image (413)', async () => {
    const unauth = await request(app).post('/api/v1/ai/attachments');
    expect(unauth.status).toBe(401);

    const badMagic = await request(app)
      .post('/api/v1/ai/attachments')
      .set('Authorization', `Bearer ${token}`)
      .field('conversationId', convId)
      .attach('file', Buffer.from('MZ\x90\x00not-an-image'), 'fake.png');
    expect(badMagic.status).toBe(415);
    expect(badMagic.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    const tooBigJpg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(10 * 1024 * 1024 + 100),
    ]);
    const bigRes = await request(app)
      .post('/api/v1/ai/attachments')
      .set('Authorization', `Bearer ${token}`)
      .field('conversationId', convId)
      .attach('file', tooBigJpg, 'huge.jpg');
    expect(bigRes.status).toBe(413);
    expect(bigRes.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('uploads valid image, blocks other users (404), and sends image_url to LLM stream', async () => {
    const pngBuf = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 79, g: 70, b: 229 } },
    })
      .png()
      .toBuffer();

    const uploaded = await request(app)
      .post('/api/v1/ai/attachments')
      .set('Authorization', `Bearer ${token}`)
      .field('conversationId', convId)
      .attach('file', pngBuf, 'diagram.png');

    expect(uploaded.status).toBe(201);
    const attId = uploaded.body.id as string;
    expect(uploaded.body.kind).toBe('image');

    const otherGet = await request(app)
      .get(`/api/v1/ai/attachments/${attId}/content`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(otherGet.status).toBe(404);

    const chatRes = await request(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Explain this diagram', attachmentIds: [attId] });

    expect(chatRes.status).toBe(200);
    expect(chatRes.text).toContain('I see your attachment.');
    const lastContent = capturedMessages?.at(-1)?.content;
    expect(Array.isArray(lastContent)).toBe(true);
    if (Array.isArray(lastContent)) {
      expect(lastContent.some((p) => p.type === 'image_url')).toBe(true);
    }
  });

  it('uploads text/document attachment and passes <attached_document> context to LLM', async () => {
    const txtRes = await request(app)
      .post('/api/v1/ai/attachments')
      .set('Authorization', `Bearer ${token}`)
      .field('conversationId', convId)
      .attach('file', Buffer.from('Newton second law: F = m * a.'), 'physics.txt');

    expect(txtRes.status).toBe(201);
    const attId = txtRes.body.id as string;

    const chatRes = await request(app)
      .post(`/api/v1/conversations/${convId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'Summarize this', attachmentIds: [attId] });

    expect(chatRes.status).toBe(200);
    const lastContent = capturedMessages?.at(-1)?.content;
    expect(typeof lastContent === 'string' && lastContent.includes('<attached_document')).toBe(
      true,
    );
    expect(typeof lastContent === 'string' && lastContent.includes('Newton second law')).toBe(true);
  });
});
