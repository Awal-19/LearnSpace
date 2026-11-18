import { randomUUID } from 'node:crypto';
import type { PrismaClient, ReviewRating } from '@prisma/client';
import sharp from 'sharp';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import type { LLMProvider } from '../../src/lib/llm/provider';
import { createLogger } from '../../src/lib/logger';
import type { StorageService } from '../../src/lib/storage';
import { signAccessToken } from '../../src/lib/tokens';
import { createStudyService } from '../../src/modules/study/study.service';
import { testEnv } from '../helpers';

interface DeckRow {
  id: string;
  userId: string;
  noteId: string | null;
  documentId: string | null;
  courseId: string | null;
  title: string;
  topic: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CardRow {
  id: string;
  deckId: string;
  front: string;
  back: string;
  topic: string | null;
  imageUrl: string | null;
  imageStorageKey: string | null;
  position: number;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
  createdAt: Date;
}

interface ReviewLogRow {
  id: string;
  userId: string;
  cardId: string;
  deckId: string;
  courseId: string | null;
  topic: string | null;
  rating: ReviewRating;
  quality: number;
  previousInterval: number;
  nextInterval: number;
  easeFactorAfter: number;
  reviewedAt: Date;
}

interface DocumentRow {
  id: string;
  userId: string;
  courseId: string | null;
  title: string;
  status: 'ready' | 'uploaded' | 'extracting' | 'failed';
  extractedText: string;
}

interface QuizRow {
  id: string;
  userId: string;
  noteId: string | null;
  courseId: string | null;
  title: string;
  topic: string | null;
  createdAt: Date;
}

interface QuestionRow {
  id: string;
  quizId: string;
  position: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface AttemptRow {
  id: string;
  quizId: string;
  userId: string;
  answers: Array<number | null>;
  score: number;
  total: number;
  takenAt: Date;
}

function makeFakeStorage(): { storage: StorageService; blobs: Map<string, Buffer> } {
  const blobs = new Map<string, Buffer>();
  const storage: StorageService = {
    isConfigured: () => true,
    uploadAvatar: async () => ({ url: '/avatar', publicId: 'a' }),
    deleteAvatar: async () => undefined,
    uploadAttachment: async (buffer, userId, _kind, ext) => {
      const storageKey = `local:${userId}/${randomUUID()}.${ext}`;
      blobs.set(storageKey, buffer);
      return { storageKey, storageUrl: storageKey };
    },
    getSignedAttachmentUrl: () => null,
    readAttachmentBytes: async (storageKey) => {
      const buf = blobs.get(storageKey);
      if (!buf) throw new Error('missing');
      return buf;
    },
    deleteAttachment: async (storageKey) => {
      blobs.delete(storageKey);
    },
  };
  return { storage, blobs };
}

function makeFakePrisma() {
  const courses = new Map<string, { id: string; userId: string }>();
  const documents = new Map<string, DocumentRow>();
  const decks = new Map<string, DeckRow>();
  const cards = new Map<string, CardRow>();
  const reviewLogs: ReviewLogRow[] = [];
  const quizzes = new Map<string, QuizRow>();
  const questions = new Map<string, QuestionRow>();
  const attempts: AttemptRow[] = [];

  const prisma = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(prisma),
    userSettings: {
      findUnique: async () => ({ timezone: 'UTC' }),
    },
    aiUsageDaily: {
      findUnique: async () => null,
      upsert: async () => ({}),
    },
    course: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const c = courses.get(where.id);
        return c && c.userId === where.userId ? c : null;
      },
    },
    note: {
      findFirst: async () => null,
    },
    document: {
      findFirst: async ({ where }: { where: { id: string; userId: string } }) => {
        const d = documents.get(where.id);
        return d && d.userId === where.userId ? d : null;
      },
    },
    deck: {
      findMany: async ({
        where,
        take,
      }: {
        where: { userId: string; courseId?: string | null };
        take: number;
      }) =>
        Array.from(decks.values())
          .filter((d) => d.userId === where.userId)
          .filter((d) => (where.courseId === undefined ? true : d.courseId === where.courseId))
          .slice(0, take)
          .map((d) => ({
            ...d,
            _count: {
              cards: Array.from(cards.values()).filter((c) => c.deckId === d.id).length,
            },
          })),
      findFirst: async ({
        where,
        include,
      }: {
        where: { id: string; userId: string };
        include?: { cards?: unknown };
      }) => {
        const d = decks.get(where.id);
        if (!d || d.userId !== where.userId) return null;
        if (include?.cards) {
          return {
            ...d,
            cards: Array.from(cards.values())
              .filter((c) => c.deckId === d.id)
              .sort((a, b) => a.position - b.position),
          };
        }
        return d;
      },
      create: async ({
        data,
      }: {
        data: {
          userId: string;
          noteId?: string | null;
          documentId?: string | null;
          courseId?: string | null;
          title: string;
          topic?: string | null;
          cards?: {
            create: Array<{ front: string; back: string; topic?: string | null; position: number }>;
          };
        };
      }) => {
        const deck: DeckRow = {
          id: randomUUID(),
          userId: data.userId,
          noteId: data.noteId ?? null,
          documentId: data.documentId ?? null,
          courseId: data.courseId ?? null,
          title: data.title,
          topic: data.topic ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        decks.set(deck.id, deck);
        const createdCards: CardRow[] = (data.cards?.create ?? []).map((c) => {
          const row: CardRow = {
            id: randomUUID(),
            deckId: deck.id,
            front: c.front,
            back: c.back,
            topic: c.topic ?? null,
            imageUrl: null,
            imageStorageKey: null,
            position: c.position,
            easeFactor: 2.5,
            intervalDays: 0,
            repetitions: 0,
            lapses: 0,
            dueAt: new Date(),
            lastReviewedAt: null,
            createdAt: new Date(),
          };
          cards.set(row.id, row);
          return row;
        });
        return { ...deck, cards: createdCards };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<DeckRow> }) => {
        const d = decks.get(where.id)!;
        Object.assign(d, data);
        return {
          ...d,
          _count: {
            cards: Array.from(cards.values()).filter((c) => c.deckId === d.id).length,
          },
        };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const d = decks.get(where.id)!;
        decks.delete(where.id);
        for (const [cid, c] of cards.entries()) {
          if (c.deckId === d.id) cards.delete(cid);
        }
        return d;
      },
    },
    card: {
      count: async ({ where }: { where: { deckId: string } }) =>
        Array.from(cards.values()).filter((c) => c.deckId === where.deckId).length,
      findMany: async ({
        where,
      }: {
        where: {
          deckId?: string | { in: string[] };
          dueAt?: { lte: Date };
          deck?: { userId: string };
          imageStorageKey?: { not: null };
        };
      }) => {
        return Array.from(cards.values())
          .filter((c) => {
            const d = decks.get(c.deckId);
            if (!d) return false;
            if (where.deck?.userId && d.userId !== where.deck.userId) return false;
            if (typeof where.deckId === 'string' && c.deckId !== where.deckId) return false;
            if (where.deckId && typeof where.deckId === 'object' && 'in' in where.deckId) {
              if (!where.deckId.in.includes(c.deckId)) return false;
            }
            if (where.dueAt?.lte && c.dueAt.getTime() > where.dueAt.lte.getTime()) return false;
            if (where.imageStorageKey?.not === null && c.imageStorageKey === null) return false;
            return true;
          })
          .map((c) => {
            const d = decks.get(c.deckId)!;
            return {
              ...c,
              deck: { id: d.id, title: d.title, courseId: d.courseId },
            };
          });
      },
      findFirst: async ({ where }: { where: { id: string; deck: { userId: string } } }) => {
        const c = cards.get(where.id);
        if (!c) return null;
        const d = decks.get(c.deckId);
        return d && d.userId === where.deck.userId
          ? { ...c, deck: { id: d.id, courseId: d.courseId, topic: d.topic } }
          : null;
      },
      create: async ({
        data,
      }: {
        data: {
          deckId: string;
          front: string;
          back: string;
          topic?: string | null;
          position: number;
        };
      }) => {
        const row: CardRow = {
          id: randomUUID(),
          deckId: data.deckId,
          front: data.front,
          back: data.back,
          topic: data.topic ?? null,
          imageUrl: null,
          imageStorageKey: null,
          position: data.position,
          easeFactor: 2.5,
          intervalDays: 0,
          repetitions: 0,
          lapses: 0,
          dueAt: new Date(),
          lastReviewedAt: null,
          createdAt: new Date(),
        };
        cards.set(row.id, row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<CardRow> }) => {
        const c = cards.get(where.id)!;
        Object.assign(c, data);
        return c;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const c = cards.get(where.id)!;
        cards.delete(where.id);
        return c;
      },
    },
    reviewLog: {
      findMany: async ({ where }: { where: { userId: string; deckId?: { in: string[] } } }) =>
        reviewLogs.filter(
          (l) =>
            l.userId === where.userId && (!where.deckId?.in || where.deckId.in.includes(l.deckId)),
        ),
      create: async ({ data }: { data: Omit<ReviewLogRow, 'id'> }) => {
        const row: ReviewLogRow = { id: randomUUID(), ...data };
        reviewLogs.push(row);
        return row;
      },
    },
    quiz: {
      findMany: async ({ where }: { where: { userId: string } }) =>
        Array.from(quizzes.values())
          .filter((q) => q.userId === where.userId)
          .map((q) => ({
            ...q,
            _count: {
              questions: Array.from(questions.values()).filter((qs) => qs.quizId === q.id).length,
            },
            attempts: attempts.filter((a) => a.quizId === q.id),
          })),
      findFirst: async ({
        where,
        include,
      }: {
        where: { id: string; userId: string };
        include?: { questions?: unknown };
      }) => {
        const q = quizzes.get(where.id);
        if (!q || q.userId !== where.userId) return null;
        if (include?.questions) {
          return {
            ...q,
            questions: Array.from(questions.values())
              .filter((qs) => qs.quizId === q.id)
              .sort((a, b) => a.position - b.position),
          };
        }
        return q;
      },
      create: async ({
        data,
      }: {
        data: {
          userId: string;
          noteId: string | null;
          courseId?: string | null;
          title: string;
          topic: string | null;
          questions: {
            create: Array<{
              position: number;
              prompt: string;
              options: string[];
              correctIndex: number;
              explanation: string;
            }>;
          };
        };
      }) => {
        const quiz: QuizRow = {
          id: randomUUID(),
          userId: data.userId,
          noteId: data.noteId,
          courseId: data.courseId ?? null,
          title: data.title,
          topic: data.topic,
          createdAt: new Date(),
        };
        quizzes.set(quiz.id, quiz);
        const qs: QuestionRow[] = data.questions.create.map((item) => {
          const row: QuestionRow = { id: randomUUID(), quizId: quiz.id, ...item };
          questions.set(row.id, row);
          return row;
        });
        return { ...quiz, questions: qs };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const q = quizzes.get(where.id)!;
        quizzes.delete(where.id);
        return q;
      },
    },
    quizAttempt: {
      create: async ({
        data,
      }: {
        data: {
          quizId: string;
          userId: string;
          answers: Array<number | null>;
          score: number;
          total: number;
        };
      }) => {
        const row: AttemptRow = { id: randomUUID(), ...data, takenAt: new Date() };
        attempts.push(row);
        return row;
      },
      findMany: async ({ where }: { where: { userId: string; quizId?: string } }) =>
        attempts
          .filter((a) => a.userId === where.userId && (!where.quizId || a.quizId === where.quizId))
          .map((a) => ({ ...a, quiz: { title: quizzes.get(a.quizId)?.title ?? 'Quiz' } })),
    },
  };

  return {
    prisma: prisma as unknown as PrismaClient,
    courses,
    documents,
    decks,
    cards,
    reviewLogs,
    quizzes,
    attempts,
  };
}

describe('flashcards & quizzes integration', () => {
  const env = testEnv();
  const logger = createLogger(env);
  let db: ReturnType<typeof makeFakePrisma>;
  let fakeStorage: ReturnType<typeof makeFakeStorage>;
  let generateResponses: string[];
  let app: ReturnType<typeof createApp>;
  let userId: string;
  let token: string;

  beforeEach(() => {
    db = makeFakePrisma();
    fakeStorage = makeFakeStorage();
    generateResponses = [];
    const llm: LLMProvider = {
      modelName: 'gemini-test',
      isConfigured: () => true,
      stream: async function* () {},
      generateText: async () => ({
        text: generateResponses.shift() ?? '{}',
      }),
    };
    const study = createStudyService({
      prisma: db.prisma,
      llm,
      logger,
      storage: fakeStorage.storage,
    });
    app = createApp(
      env,
      {
        checkDb: async () => undefined,
        study: { service: study, isEmailVerified: async () => true },
      },
      logger,
    );
    userId = randomUUID();
    token = signAccessToken(userId, env.JWT_SECRET).token;
  });

  it('retries AI deck generation once on bad JSON and saves nothing when both fail', async () => {
    generateResponses.push('not-json', 'still-not-json');
    const failed = await request(app)
      .post('/api/v1/decks/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ topic: 'Operating Systems', count: 5 });
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe('AI_BAD_OUTPUT');
    expect(db.decks.size).toBe(0);

    generateResponses.push(
      'bad-json',
      JSON.stringify({
        title: 'OS Concepts',
        cards: [
          { front: 'What is a mutex?', back: 'A mutual exclusion lock.' },
          { front: 'What is paging?', back: 'Fixed-size memory frames.' },
        ],
      }),
    );
    const ok = await request(app)
      .post('/api/v1/decks/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ topic: 'Operating Systems', count: 5 });
    expect(ok.status).toBe(201);
    expect(ok.body.cards).toHaveLength(2);
  });

  it('generates quiz without leaking answers, grades attempt, and tracks score history', async () => {
    generateResponses.push(
      JSON.stringify({
        title: 'Data Structures Quiz',
        questions: [
          {
            prompt: 'Lookup time in a hash table (avg)?',
            options: ['O(1)', 'O(n)', 'O(log n)', 'O(n^2)'],
            correctIndex: 0,
            explanation: 'Hashing maps keys directly to buckets.',
          },
          {
            prompt: 'Which structure is LIFO?',
            options: ['Queue', 'Stack', 'Heap', 'Graph'],
            correctIndex: 1,
            explanation: 'Stacks pop the most recently pushed item.',
          },
        ],
      }),
    );

    const created = await request(app)
      .post('/api/v1/quizzes/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ topic: 'Data Structures', count: 5 });
    expect(created.status).toBe(201);
    expect(created.body.questions[0].correctIndex).toBeUndefined();

    const quizId = created.body.id as string;
    const submitted = await request(app)
      .post(`/api/v1/quizzes/${quizId}/attempts`)
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [0, 0] });
    expect(submitted.status).toBe(201);
    expect(submitted.body.score).toBe(1);
    expect(submitted.body.total).toBe(2);
    expect(submitted.body.results[0].correct).toBe(true);
    expect(submitted.body.results[1].correct).toBe(false);

    const list = await request(app).get('/api/v1/quizzes').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body[0].attempts).toBe(1);
    expect(list.body[0].bestScore).toBe(0.5);
  });

  it('supports SM-2 card reviews, review logs, due summary, and per-deck stats', async () => {
    const createdDeck = await request(app)
      .post('/api/v1/decks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Algorithms',
        topic: 'Sorting',
        cards: [
          { front: 'Quicksort worst case?', back: 'O(n^2)', topic: 'Divide & Conquer' },
          { front: 'Mergesort space?', back: 'O(n)', topic: 'Divide & Conquer' },
        ],
      });
    expect(createdDeck.status).toBe(201);
    const deckId = createdDeck.body.id as string;
    const cardA = createdDeck.body.cards[0].id as string;

    const summaryBefore = await request(app)
      .get('/api/v1/decks/due-summary')
      .set('Authorization', `Bearer ${token}`);
    expect(summaryBefore.status).toBe(200);
    expect(summaryBefore.body.dueTodayCount).toBe(2);
    expect(summaryBefore.body.decks[0].deckId).toBe(deckId);

    const reviewGood = await request(app)
      .post(`/api/v1/cards/${cardA}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 'good' });
    expect(reviewGood.status).toBe(200);
    expect(reviewGood.body.card.intervalDays).toBe(1);
    expect(reviewGood.body.card.repetitions).toBe(1);
    expect(reviewGood.body.card.accuracy).toBe(100);
    expect(reviewGood.body.review.quality).toBe(3);
    expect(reviewGood.body.deckDueCount).toBe(1);
    expect(db.reviewLogs).toHaveLength(1);

    const dueQueue = await request(app)
      .get(`/api/v1/decks/${deckId}/due`)
      .set('Authorization', `Bearer ${token}`);
    expect(dueQueue.status).toBe(200);
    expect(dueQueue.body.cards).toHaveLength(1);
    expect(dueQueue.body.deck.dueCount).toBe(1);
    expect(dueQueue.body.deck.streakDays).toBe(1);
    expect(dueQueue.body.deck.accuracy).toBe(100);
  });

  it('imports flashcards in bulk from CSV and tracks accuracy after Again rating', async () => {
    const deck = await request(app)
      .post('/api/v1/decks')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Networking' });
    const deckId = deck.body.id as string;

    const imported = await request(app)
      .post(`/api/v1/decks/${deckId}/import-csv`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        hasHeader: true,
        csvText:
          'Front,Back,Topic\n"SYN, SYN-ACK, ACK",Three-way handshake,TCP\nUDP,Connectionless,Transport',
      });
    expect(imported.status).toBe(201);
    expect(imported.body.importedCount).toBe(2);
    const firstCardId = imported.body.cards[0].id as string;

    const failedReview = await request(app)
      .post(`/api/v1/cards/${firstCardId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 'again' });
    expect(failedReview.status).toBe(200);
    expect(failedReview.body.card.lapses).toBe(1);
    expect(failedReview.body.card.accuracy).toBe(0);
  });

  it('generates flashcards from a ready document and inherits courseId', async () => {
    const courseId = randomUUID();
    const docId = randomUUID();
    db.courses.set(courseId, { id: courseId, userId });
    db.documents.set(docId, {
      id: docId,
      userId,
      courseId,
      title: 'Week 4 Lecture Slides',
      status: 'ready',
      extractedText:
        'Virtual memory maps virtual addresses to physical page frames via page tables and the TLB.',
    });

    generateResponses.push(
      JSON.stringify({
        title: 'Virtual Memory Deck',
        cards: [
          {
            front: 'What does the TLB cache?',
            back: 'Recent virtual-to-physical page translations',
            topic: 'Memory',
          },
        ],
      }),
    );

    const res = await request(app)
      .post('/api/v1/decks/generate')
      .set('Authorization', `Bearer ${token}`)
      .send({ documentId: docId, count: 5 });
    expect(res.status).toBe(201);
    expect(res.body.documentId).toBe(docId);
    expect(res.body.courseId).toBe(courseId);
    expect(res.body.cards[0].topic).toBe('Memory');
  });

  it('uploads, serves, and deletes an image attachment on a flashcard', async () => {
    const deck = await request(app)
      .post('/api/v1/decks')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Anatomy',
        cards: [{ front: 'Identify the aorta', back: 'Main systemic artery' }],
      });
    const cardId = deck.body.cards[0].id as string;

    const pngBuf = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 37, g: 99, b: 235 } },
    })
      .png()
      .toBuffer();

    const badUpload = await request(app)
      .post(`/api/v1/cards/${cardId}/image`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not-an-image'), 'fake.txt');
    expect(badUpload.status).toBe(415);

    const uploaded = await request(app)
      .post(`/api/v1/cards/${cardId}/image`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', pngBuf, 'diagram.png');
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.imageUrl).toContain(`/api/v1/cards/${cardId}/image`);
    expect(fakeStorage.blobs.size).toBe(1);

    const fetched = await request(app)
      .get(`/api/v1/cards/${cardId}/image`)
      .set('Authorization', `Bearer ${token}`);
    expect(fetched.status).toBe(200);
    expect(fetched.headers['content-type']).toContain('image/webp');

    const removed = await request(app)
      .delete(`/api/v1/cards/${cardId}/image`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(200);
    expect(removed.body.imageUrl).toBeNull();
    expect(fakeStorage.blobs.size).toBe(0);
  });
});
