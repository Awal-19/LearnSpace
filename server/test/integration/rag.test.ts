import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { createLogger } from '../../src/lib/logger';
import { signAccessToken } from '../../src/lib/tokens';
import {
  chunkText,
  createRagService,
  formatRagContext,
  isPdfBuffer,
} from '../../src/modules/rag/rag.service';
import { testEnv } from '../helpers';

interface DocRow {
  id: string;
  userId: string;
  filename: string;
  sizeBytes: number;
  pageCount: number;
  createdAt: Date;
}

interface ChunkRow {
  id: string;
  documentId: string;
  userId: string;
  chunkIndex: number;
  content: string;
  createdAt: Date;
}

function makeFakePrisma() {
  const docs = new Map<string, DocRow>();
  const chunks: ChunkRow[] = [];

  const prisma = {
    studyDocument: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        Array.from(docs.values())
          .filter((d) => d.userId === where.userId)
          .map((d) => ({
            ...d,
            _count: { chunks: chunks.filter((c) => c.documentId === d.id).length },
          })),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const d = docs.get(where.id);
        return d && d.userId === where.userId ? d : null;
      },
      create: async ({
        data,
      }: {
        data: {
          userId: string;
          filename: string;
          sizeBytes: number;
          pageCount: number;
          chunks: { create: Array<{ userId: string; chunkIndex: number; content: string }> };
        };
      }) => {
        const doc: DocRow = {
          id: randomUUID(),
          userId: data.userId,
          filename: data.filename,
          sizeBytes: data.sizeBytes,
          pageCount: data.pageCount,
          createdAt: new Date(),
        };
        docs.set(doc.id, doc);
        for (const c of data.chunks.create) {
          chunks.push({ id: randomUUID(), documentId: doc.id, ...c, createdAt: new Date() });
        }
        return doc;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const d = docs.get(where.id)!;
        docs.delete(where.id);
        return d;
      },
    },
    documentChunk: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        chunks
          .filter((c) => c.userId === where.userId)
          .map((c) => ({
            ...c,
            document: { filename: docs.get(c.documentId)?.filename ?? 'notes.pdf' },
          })),
    },
  };

  return { prisma: prisma as unknown as PrismaClient, docs, chunks };
}

describe('RAG helpers & endpoints', () => {
  const env = testEnv();
  const logger = createLogger(env);
  let db: ReturnType<typeof makeFakePrisma>;
  let rag: ReturnType<typeof createRagService>;
  let app: ReturnType<typeof createApp>;
  let userId: string;
  let otherUserId: string;
  let token: string;
  let otherToken: string;

  beforeEach(() => {
    db = makeFakePrisma();
    rag = createRagService({ prisma: db.prisma, logger });
    app = createApp(
      env,
      {
        checkDb: async () => undefined,
        rag: { service: rag, isEmailVerified: async () => true },
      },
      logger,
    );
    userId = randomUUID();
    otherUserId = randomUUID();
    token = signAccessToken(userId, env.JWT_SECRET).token;
    otherToken = signAccessToken(otherUserId, env.JWT_SECRET).token;
  });

  it('validates PDF magic bytes, chunks text, and formats RAG context safely', () => {
    expect(isPdfBuffer(Buffer.from('%PDF-1.7\n...'))).toBe(true);
    expect(isPdfBuffer(Buffer.from('not-a-pdf'))).toBe(false);

    const chunks = chunkText('A '.repeat(600), 400, 50);
    expect(chunks.length).toBeGreaterThan(1);

    const formatted = formatRagContext([
      {
        documentId: 'd1',
        filename: 'cs101.pdf',
        chunkIndex: 0,
        content: 'Dijkstra finds shortest paths in graphs with non-negative weights.',
        score: 2,
      },
    ]);
    expect(formatted).toMatch(/<lecture_notes\b/);
    expect(formatted).toContain('cs101.pdf');
  });

  it('rejects non-PDF upload with 415 and retrieves/isolates user chunks', async () => {
    const bad = await request(app)
      .post('/api/v1/ai/upload-notes')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('MZ\x90\x00fake'), 'notes.pdf');
    expect(bad.status).toBe(415);
    expect(bad.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');

    const created = await db.prisma.studyDocument.create({
      data: {
        userId,
        filename: 'algorithms.pdf',
        sizeBytes: 1024,
        pageCount: 3,
        chunks: {
          create: [
            { userId, chunkIndex: 0, content: 'Merge sort has O(n log n) worst-case complexity.' },
            { userId, chunkIndex: 1, content: 'Quick sort has O(n log n) average complexity.' },
          ],
        },
      },
    });

    const retrieved = await rag.retrieveRelevantChunks(userId, 'What is merge sort complexity?');
    expect(retrieved[0]?.filename).toBe('algorithms.pdf');
    expect(retrieved[0]?.content).toContain('Merge sort');

    const list = await request(app)
      .get('/api/v1/ai/documents')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const invalidCourseFilter = await request(app)
      .get('/api/v1/ai/documents?courseId=not-a-uuid')
      .set('Authorization', `Bearer ${token}`);
    expect(invalidCourseFilter.status).toBe(400);

    const noneCourseFilter = await request(app)
      .get('/api/v1/ai/documents?courseId=none')
      .set('Authorization', `Bearer ${token}`);
    expect(noneCourseFilter.status).toBe(200);

    const otherDel = await request(app)
      .delete(`/api/v1/ai/documents/${created.id}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(otherDel.status).toBe(404);
  });
});
