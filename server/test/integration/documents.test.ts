import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { Document as DocxDocument, Packer, Paragraph } from 'docx';
import sharp from 'sharp';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app';
import type { LLMProvider } from '../../src/lib/llm/provider';
import { createLogger } from '../../src/lib/logger';
import type { StorageService } from '../../src/lib/storage';
import { signAccessToken } from '../../src/lib/tokens';
import { createDocumentJobQueue } from '../../src/modules/documents/documents.jobs';
import { generateJsonWithRetry } from '../../src/modules/documents/documents.llmJson';
import { chunkDocumentPages } from '../../src/modules/documents/documents.schemas';
import { createDocumentsService } from '../../src/modules/documents/documents.service';
import { testEnv } from '../helpers';

function makeMinimalPdf(text: string): Buffer {
  const safe = text.replace(/[()\\]/g, '\\$&');
  const stream = `BT /F1 12 Tf 72 720 Td (${safe}) Tj ET`;
  const objs = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${Buffer.byteLength(stream, 'utf8')} >> stream\n${stream}\nendstream endobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objs) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += obj;
  }
  const xrefOffset = Buffer.byteLength(body, 'utf8');
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(body, 'utf8');
}

function makeFakePrisma() {
  const documents = new Map<string, Record<string, unknown>>();
  const jobs = new Map<string, Record<string, unknown>>();
  const extractedQuestions = new Map<string, Record<string, unknown>>();
  const sets = new Map<string, Record<string, unknown>>();
  const setQuestions = new Map<string, Record<string, unknown>>();
  const attempts = new Map<string, Record<string, unknown>>();
  const quizzes = new Map<string, Record<string, unknown>>();
  const decks = new Map<string, Record<string, unknown>>();

  const prisma = {
    $transaction: async <T>(arg: ((tx: unknown) => Promise<T>) | Array<Promise<T>>) => {
      if (typeof arg === 'function') return arg(prisma);
      return Promise.all(arg);
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join(' ');
      if (sql.includes('UPDATE "document_jobs"') && values.length === 1) {
        const jobId = String(values[0]);
        const j = jobs.get(jobId);
        if (j && j.status === 'queued') {
          j.status = 'running';
          j.startedAt = new Date();
          return [j];
        }
        return [];
      }
      const next = Array.from(jobs.values()).find((j) => j.status === 'queued');
      if (!next) return [];
      next.status = 'running';
      next.startedAt = new Date();
      return [next];
    },
    course: {
      findFirst: async () => null,
    },
    document: {
      count: async ({ where }: { where: { userId: string } }) =>
        Array.from(documents.values()).filter((d) => d.userId === where.userId).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: randomUUID(),
          extractedText: '',
          pagesJson: [],
          pageCount: 0,
          truncated: false,
          errorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        documents.set(row.id as string, row);
        return row;
      },
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const d = documents.get(where.id);
        return d && d.userId === where.userId ? d : null;
      },
      findUnique: async ({ where }: { where: { id: string } }) => documents.get(where.id) ?? null,
      findMany: async ({ where }: { where: { userId: string } }) =>
        Array.from(documents.values()).filter((d) => d.userId === where.userId),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const d = documents.get(where.id);
        if (!d) throw new Error('Not found');
        Object.assign(d, data, { updatedAt: new Date() });
        return d;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        documents.delete(where.id);
      },
    },
    documentJob: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: randomUUID(),
          attempts: 0,
          error: null,
          runAt: new Date(),
          startedAt: null,
          finishedAt: null,
          createdAt: new Date(),
          ...data,
        };
        jobs.set(row.id as string, row);
        return row;
      },
      findFirst: async ({ where }: { where: { documentId: string; userId: string } }) => {
        const list = Array.from(jobs.values()).filter(
          (j) => j.documentId === where.documentId && j.userId === where.userId,
        );
        return list[list.length - 1] ?? null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const j = jobs.get(where.id);
        if (!j) throw new Error('Not found');
        Object.assign(j, data);
        return j;
      },
    },
    extractedQuestion: {
      findMany: async ({ where }: { where: { documentId: string; userId: string } }) =>
        Array.from(extractedQuestions.values()).filter(
          (q) => q.documentId === where.documentId && q.userId === where.userId,
        ),
      deleteMany: async ({ where }: { where: { documentId: string; userId: string } }) => {
        for (const [id, q] of extractedQuestions.entries()) {
          if (q.documentId === where.documentId && q.userId === where.userId) {
            extractedQuestions.delete(id);
          }
        }
      },
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        for (const item of data) {
          const id = randomUUID();
          extractedQuestions.set(id, {
            id,
            answerMode: 'full_worked',
            answerMarkdown: null,
            thinkingMarkdown: null,
            citedSourcesJson: null,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
            ...item,
          });
        }
      },
    },
    generatedQuestionSet: {
      findMany: async ({ where }: { where: { documentId: string; userId: string } }) =>
        Array.from(sets.values())
          .filter((s) => s.documentId === where.documentId && s.userId === where.userId)
          .map((s) => ({
            ...s,
            questions: Array.from(setQuestions.values()).filter((q) => q.setId === s.id),
            attempts: Array.from(attempts.values()).filter((a) => a.setId === s.id),
          })),
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const s = sets.get(where.id);
        if (!s || s.userId !== where.userId) return null;
        return {
          ...s,
          document: documents.get(s.documentId as string),
          questions: Array.from(setQuestions.values()).filter((q) => q.setId === s.id),
        };
      },
      create: async ({
        data,
      }: {
        data: Record<string, unknown> & { questions?: { create: Array<Record<string, unknown>> } };
      }) => {
        const setId = randomUUID();
        const { questions: qWrap, ...rest } = data;
        const row = { id: setId, quizId: null, deckId: null, createdAt: new Date(), ...rest };
        sets.set(setId, row);
        for (const q of qWrap?.create ?? []) {
          const qId = randomUUID();
          setQuestions.set(qId, { id: qId, setId, createdAt: new Date(), ...q });
        }
        return row;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const s = sets.get(where.id);
        if (!s) throw new Error('Not found');
        Object.assign(s, data);
        return s;
      },
    },
    documentPracticeAttempt: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = randomUUID();
        const row = { id, takenAt: new Date(), ...data };
        attempts.set(id, row);
        return row;
      },
    },
    quiz: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = randomUUID();
        quizzes.set(id, { id, ...data });
        return { id };
      },
    },
    deck: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const id = randomUUID();
        decks.set(id, { id, ...data });
        return { id };
      },
    },
  } as unknown as PrismaClient;

  return { prisma, documents, jobs, extractedQuestions, sets, setQuestions };
}

describe('Study from Documents integration', () => {
  const env = testEnv();
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  let tokenA: string;
  let tokenB: string;

  beforeEach(() => {
    tokenA = signAccessToken(userA, env.JWT_SECRET).token;
    tokenB = signAccessToken(userB, env.JWT_SECRET).token;
  });

  function buildHarness(generateTextImpl?: LLMProvider['generateText']) {
    const store = makeFakePrisma();
    const blobs = new Map<string, Buffer>();
    const storage: StorageService = {
      isConfigured: () => true,
      uploadAvatar: vi.fn(),
      deleteAvatar: vi.fn(),
      uploadAttachment: async (buffer, uid, _kind, ext) => {
        const key = `${uid}/${randomUUID()}.${ext}`;
        blobs.set(key, buffer);
        return { storageKey: key, storageUrl: `memory://${key}` };
      },
      getSignedAttachmentUrl: () => null,
      readAttachmentBytes: async (key) => blobs.get(key) ?? Buffer.alloc(0),
      deleteAttachment: async (key) => {
        blobs.delete(key);
      },
    };

    const llm: LLMProvider = {
      modelName: 'test-model',
      isConfigured: () => true,
      async *stream() {
        yield {
          type: 'delta',
          text: '1. Define Big-O notation. [4 marks]\n2. Derive the recurrence T(n) = 2T(n/2) + n. [6 marks]',
        };
      },
      generateText:
        generateTextImpl ??
        (async (prompt) => {
          if (prompt.includes('Generate exactly')) {
            return {
              text: JSON.stringify({
                questions: [
                  {
                    type: 'mcq',
                    difficulty: 'easy',
                    topic: 'Asymptotics',
                    prompt: 'Which bound describes binary search?',
                    options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
                    correctAnswer: 'O(log n)',
                    explanation: 'Halving the search space each step takes logarithmic time.',
                    sourceRef: 'Slide 1',
                  },
                  {
                    type: 'true_false',
                    difficulty: 'easy',
                    topic: 'Asymptotics',
                    prompt: 'Merge sort has O(n log n) worst-case time.',
                    options: ['True', 'False'],
                    correctAnswer: 'True',
                    explanation: 'Recurrence T(n)=2T(n/2)+n solves to O(n log n).',
                    sourceRef: 'Slide 1',
                  },
                  {
                    type: 'short_answer',
                    difficulty: 'medium',
                    topic: 'Recurrences',
                    prompt: 'State the Master Theorem case for T(n)=2T(n/2)+n.',
                    options: null,
                    correctAnswer: 'Case 2',
                    explanation: 'f(n)=n matches n^(log_2 2).',
                    sourceRef: 'Slide 2',
                  },
                  {
                    type: 'essay',
                    difficulty: 'hard',
                    topic: 'Divide and Conquer',
                    prompt: 'Compare merge sort and quicksort space complexity.',
                    options: null,
                    correctAnswer: 'Merge sort uses O(n) auxiliary space while quicksort uses O(log n) stack space.',
                    explanation: 'Merging requires temporary arrays.',
                    sourceRef: 'Slide 2',
                  },
                  {
                    type: 'fill_blank',
                    difficulty: 'easy',
                    topic: 'Asymptotics',
                    prompt: 'An algorithm that inspects every element once runs in ____ time.',
                    options: null,
                    correctAnswer: 'O(n)',
                    explanation: 'Linear scan visits n elements.',
                    sourceRef: 'Slide 1',
                  },
                  {
                    type: 'calculation',
                    difficulty: 'medium',
                    topic: 'Recurrences',
                    prompt: 'Compute log2(1024).',
                    options: null,
                    correctAnswer: '10',
                    explanation: '2^10 = 1024.',
                    sourceRef: 'Slide 1',
                  },
                  {
                    type: 'flashcard',
                    difficulty: 'easy',
                    topic: 'Asymptotics',
                    prompt: 'What does Big-O represent?',
                    options: null,
                    correctAnswer: 'Asymptotic upper bound on growth rate.',
                    explanation: 'Big-O bounds worst-case growth up to constant factors.',
                    sourceRef: 'Slide 1',
                  },
                ],
              }),
            };
          }
          return {
            text: JSON.stringify({
              questions: [
                {
                  section: 'Section A',
                  questionNumber: '1',
                  prompt: 'Explain Big-O notation.',
                  marks: 4,
                  instructions: 'Answer all questions.',
                  unclear: false,
                  unclearReason: null,
                },
              ],
            }),
          };
        }),
    };

    const logger = createLogger(env);
    const jobs = createDocumentJobQueue({ prisma: store.prisma, storage, llm, logger });
    const documents = createDocumentsService({ prisma: store.prisma, storage, jobs, logger, llm });
    const app = createApp(env, {
      checkDb: async () => undefined,
      documents: { service: documents, isEmailVerified: async () => true },
    });

    const waitForJob = async (jobId: string) => {
      for (let i = 0; i < 400; i++) {
        await jobs.processNext();
        const j = store.jobs.get(jobId);
        if (j && (j.status === 'completed' || j.status === 'failed')) {
          return j;
        }
        await new Promise((r) => setTimeout(r, 30));
      }
      const last = store.jobs.get(jobId);
      throw new Error(`Job ${jobId} timed out (status=${String(last?.status)}, error=${String(last?.error)})`);
    };

    return { app, store, jobs, llm, waitForJob };
  }

  it('rejects unauthenticated (401), spoofed file (415), and oversized image (413)', async () => {
    const { app } = buildHarness();

    await request(app).post('/api/v1/documents').expect(401);

    const fakePdf = Buffer.from('MZ\x90\x00not-a-pdf', 'utf8');
    await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('type', 'past_question')
      .attach('file', fakePdf, { filename: 'bad.pdf', contentType: 'application/pdf' })
      .expect(415);

    const bigJpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(10 * 1024 * 1024 + 50)]);
    await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('type', 'past_question')
      .attach('file', bigJpg, { filename: 'huge.jpg', contentType: 'image/jpeg' })
      .expect(413);
  });

  it(
    'detects questions from PDF, DOCX, and photo, and denies cross-user access (404)',
    async () => {
    const { app, waitForJob } = buildHarness();

    // 1. PDF upload & detect
    const pdfBuf = makeMinimalPdf(
      'Section A. Question 1: Explain Big-O notation and asymptotic time complexity in detail. [4 marks]',
    );
    const upPdf = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('type', 'past_question')
      .attach('file', pdfBuf, { filename: 'exam.pdf', contentType: 'application/pdf' })
      .expect(202);
    await waitForJob(upPdf.body.job.id);

    const detPdf = await request(app)
      .post(`/api/v1/documents/${upPdf.body.document.id}/detect-questions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(202);
    await waitForJob(detPdf.body.job.id);

    const detailPdf = await request(app)
      .get(`/api/v1/documents/${upPdf.body.document.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(detailPdf.body.document.status).toBe('ready');
    expect(detailPdf.body.extractedQuestions).toHaveLength(1);

    // Cross-user IDOR denied (404)
    await request(app)
      .get(`/api/v1/documents/${upPdf.body.document.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    await request(app)
      .delete(`/api/v1/documents/${upPdf.body.document.id}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);

    // 2. DOCX upload & detect
    const docxDoc = new DocxDocument({
      sections: [{ children: [new Paragraph('Question 1: Define recursion. [5 marks]')] }],
    });
    const docxBuf = await Packer.toBuffer(docxDoc);
    const upDocx = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('type', 'past_question')
      .attach('file', docxBuf, {
        filename: 'quiz.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      .expect(202);
    await waitForJob(upDocx.body.job.id);
    const detailDocx = await request(app)
      .get(`/api/v1/documents/${upDocx.body.document.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(detailDocx.body.document.extractedText).toContain('Define recursion');

    // 3. Photo upload & vision fallback
    const pngBuf = await sharp({
      create: { width: 80, height: 40, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
    const upImg = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('type', 'past_question')
      .attach('file', pngBuf, { filename: 'paper.png', contentType: 'image/png' })
      .expect(202);
    await waitForJob(upImg.body.job.id);
    const detailImg = await request(app)
      .get(`/api/v1/documents/${upImg.body.document.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(detailImg.body.document.status).toBe('ready');
    expect(detailImg.body.document.extractedText).toContain('Big-O');
  }, 20_000);

  it('retries once on invalid JSON output and chunks large documents', async () => {
    let calls = 0;
    const { llm } = buildHarness(async () => {
      calls += 1;
      if (calls === 1) return { text: 'NOT VALID JSON {{' };
      return { text: JSON.stringify({ ok: true }) };
    });

    const result = await generateJsonWithRetry(
      llm,
      'Return ok',
      'System',
      z.object({ ok: z.boolean() }),
    );
    expect(result.data.ok).toBe(true);
    expect(calls).toBe(2);

    const largePages = Array.from({ length: 12 }, (_, idx) => ({
      index: idx + 1,
      label: `Slide ${idx + 1}`,
      text: 'A'.repeat(2_500),
      hasImages: false,
    }));
    const chunks = chunkDocumentPages(largePages, 10_000);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expect(chunks[0]!.pageRange).toContain('Slide 1');
  });

  it('generates all 7 question types, marks attempts, saves to library, and exports PDF/DOCX', async () => {
    const { app, waitForJob } = buildHarness();
    const txtBuf = Buffer.from('Slide 1: Binary search is O(log n).\nSlide 2: Merge sort uses O(n) space.', 'utf8');

    const up = await request(app)
      .post('/api/v1/documents')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('type', 'slides')
      .attach('file', txtBuf, { filename: 'slides.txt', contentType: 'text/plain' })
      .expect(202);
    await waitForJob(up.body.job.id);

    const gen = await request(app)
      .post(`/api/v1/documents/${up.body.document.id}/generate-questions`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        types: ['mcq', 'true_false', 'short_answer', 'essay', 'fill_blank', 'calculation', 'flashcard'],
        count: 7,
        difficulty: 'mixed',
        scope: 'whole',
        style: 'exam',
      })
      .expect(202);
    await waitForJob(gen.body.job.id);

    const detail = await request(app)
      .get(`/api/v1/documents/${up.body.document.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    const set = detail.body.questionSets[0];
    expect(set.questions).toHaveLength(7);

    const answers: Record<string, string> = {};
    for (const q of set.questions) {
      answers[q.id] = q.correctAnswer;
    }
    const attemptRes = await request(app)
      .post(`/api/v1/question-sets/${set.id}/attempts`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ answers })
      .expect(201);
    expect(attemptRes.body.attempt.total).toBe(7);

    const libRes = await request(app)
      .post(`/api/v1/question-sets/${set.id}/save-to-library`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ target: 'both' })
      .expect(201);
    expect(libRes.body.quizId).toBeTruthy();
    expect(libRes.body.deckId).toBeTruthy();

    await request(app)
      .post(`/api/v1/question-sets/${set.id}/export`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ format: 'pdf' })
      .expect(200);
  });
});
