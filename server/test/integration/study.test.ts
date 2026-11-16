import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import type { LLMProvider } from '../../src/lib/llm/provider';
import { createLogger } from '../../src/lib/logger';
import { signAccessToken } from '../../src/lib/tokens';
import { createStudyService } from '../../src/modules/study/study.service';
import { testEnv } from '../helpers';

interface DeckRow {
  id: string;
  userId: string;
  noteId: string | null;
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
  position: number;
  createdAt: Date;
}

interface QuizRow {
  id: string;
  userId: string;
  noteId: string | null;
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

function makeFakePrisma() {
  const decks = new Map<string, DeckRow>();
  const cards = new Map<string, CardRow>();
  const quizzes = new Map<string, QuizRow>();
  const questions = new Map<string, QuestionRow>();
  const attempts: AttemptRow[] = [];

  const prisma = {
    note: {
      findFirst: async () => null,
    },
    deck: {
      findMany: async ({ where, take }: { where: { userId: string }; take: number }) =>
        Array.from(decks.values())
          .filter((d) => d.userId === where.userId)
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
          title: string;
          topic?: string | null;
          cards?: { create: Array<{ front: string; back: string; position: number }> };
        };
      }) => {
        const deck: DeckRow = {
          id: randomUUID(),
          userId: data.userId,
          noteId: data.noteId ?? null,
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
            position: c.position,
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
        return d;
      },
    },
    card: {
      count: async ({ where }: { where: { deckId: string } }) =>
        Array.from(cards.values()).filter((c) => c.deckId === where.deckId).length,
      findFirst: async ({ where }: { where: { id: string; deck: { userId: string } } }) => {
        const c = cards.get(where.id);
        if (!c) return null;
        const d = decks.get(c.deckId);
        return d && d.userId === where.deck.userId ? c : null;
      },
      create: async ({
        data,
      }: {
        data: { deckId: string; front: string; back: string; position: number };
      }) => {
        const row: CardRow = { id: randomUUID(), ...data, createdAt: new Date() };
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

  return { prisma: prisma as unknown as PrismaClient, decks, quizzes, attempts };
}

describe('flashcards & quizzes integration', () => {
  const env = testEnv();
  const logger = createLogger(env);
  let db: ReturnType<typeof makeFakePrisma>;
  let generateResponses: string[];
  let app: ReturnType<typeof createApp>;
  let userId: string;
  let token: string;

  beforeEach(() => {
    db = makeFakePrisma();
    generateResponses = [];
    const llm: LLMProvider = {
      modelName: 'gemini-test',
      isConfigured: () => true,
      stream: async function* () {},
      generateText: async () => ({
        text: generateResponses.shift() ?? '{}',
      }),
    };
    const study = createStudyService({ prisma: db.prisma, llm, logger });
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

    const list = await request(app)
      .get('/api/v1/quizzes')
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body[0].attempts).toBe(1);
    expect(list.body[0].bestScore).toBe(0.5);
  });
});

