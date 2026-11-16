import type { Card, Deck, PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { z } from 'zod';
import { AppError } from '../../lib/errors';
import type { LLMProvider } from '../../lib/llm/provider';
import {
  aiDeckOutputSchema,
  aiQuizOutputSchema,
  type CreateCardInput,
  type CreateDeckInput,
  type GenerateDeckInput,
  type GenerateQuizInput,
  type PaginationQuery,
  type QuizAttemptsRangeQuery,
  type SubmitAttemptInput,
  type UpdateCardInput,
  type UpdateDeckInput,
} from './study.schemas';

export interface PublicDeck {
  id: string;
  title: string;
  topic: string | null;
  noteId: string | null;
  cardCount: number;
  createdAt: Date;
}

export interface PublicCard {
  id: string;
  front: string;
  back: string;
  position: number;
}

export interface PublicQuizSummary {
  id: string;
  title: string;
  topic: string | null;
  noteId: string | null;
  questionCount: number;
  attempts: number;
  bestScore: number | null;
  lastScore: number | null;
  createdAt: Date;
}

export interface PublicQuizToTake {
  id: string;
  title: string;
  topic: string | null;
  questions: Array<{ id: string; prompt: string; options: string[] }>;
}

export interface StudyServiceDeps {
  prisma: PrismaClient;
  llm: LLMProvider;
  logger: Logger;
}

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

async function generateValidatedJson<T>(
  llm: LLMProvider,
  prompt: string,
  schema: z.ZodType<T>,
  logger: Logger,
): Promise<T> {
  if (!llm.isConfigured()) {
    throw new AppError('AI_UNAVAILABLE', 'AI generator is not available right now');
  }

  let lastError: string | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const fullPrompt =
      attempt === 0
        ? prompt
        : `${prompt}\n\nIMPORTANT: Your previous output was invalid (${lastError}). Return ONLY valid JSON matching the exact schema.`;

    const { text } = await llm.generateText(fullPrompt, {
      systemPrompt: 'You output strictly valid JSON with no markdown or extra commentary.',
      temperature: 0.3,
      maxOutputTokens: 3000,
      responseMimeType: 'application/json',
    });

    try {
      const parsed = JSON.parse(stripJsonFences(text));
      const validated = schema.safeParse(parsed);
      if (validated.success) {
        return validated.data;
      }
      lastError = validated.error.issues.map((i) => i.message).join('; ');
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Invalid JSON';
    }
    logger.warn({ attempt, lastError }, 'AI JSON generation validation failed');
  }

  throw new AppError('AI_BAD_OUTPUT', 'The AI returned an invalid structure. Please try again.');
}

function toPublicCard(c: Card): PublicCard {
  return { id: c.id, front: c.front, back: c.back, position: c.position };
}

function toPublicDeck(d: Deck, cardCount: number): PublicDeck {
  return {
    id: d.id,
    title: d.title,
    topic: d.topic,
    noteId: d.noteId,
    cardCount,
    createdAt: d.createdAt,
  };
}

export function createStudyService({ prisma, llm, logger }: StudyServiceDeps) {
  async function resolveSourceMaterial(userId: string, noteId?: string, topic?: string) {
    if (noteId) {
      const note = await prisma.note.findFirst({ where: { id: noteId, userId } });
      if (!note) throw new AppError('NOT_FOUND', 'Note not found');
      if (note.body.trim().length < 30) {
        throw new AppError('VALIDATION_ERROR', 'Note needs at least 30 characters to generate study material');
      }
      return {
        noteId: note.id,
        topic: note.title,
        sourceText: `Title: ${note.title}\n\nContent:\n${note.body.slice(0, 8000)}`,
      };
    }
    return {
      noteId: null,
      topic: topic ?? 'General study',
      sourceText: `Topic: ${topic}`,
    };
  }

  async function assertDeckOwned(userId: string, deckId: string) {
    const deck = await prisma.deck.findFirst({ where: { id: deckId, userId } });
    if (!deck) throw new AppError('NOT_FOUND', 'Deck not found');
    return deck;
  }

  return {
    // --------------------------------------------------------- Decks & Cards
    async listDecks(userId: string, query: PaginationQuery) {
      const rows = await prisma.deck.findMany({
        where: { userId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        include: { _count: { select: { cards: true } } },
      });
      const hasMore = rows.length > query.limit;
      const sliced = hasMore ? rows.slice(0, query.limit) : rows;
      return {
        items: sliced.map((d) => toPublicDeck(d, d._count.cards)),
        nextCursor: hasMore ? (sliced.at(-1)?.id ?? null) : null,
      };
    },

    async createDeck(userId: string, input: CreateDeckInput) {
      const cardsData = (input.cards ?? []).map((c, idx) => ({
        front: c.front,
        back: c.back,
        position: idx,
      }));
      const deck = await prisma.deck.create({
        data: {
          userId,
          title: input.title,
          topic: input.topic ?? null,
          ...(cardsData.length > 0 ? { cards: { create: cardsData } } : {}),
        },
        include: { cards: { orderBy: { position: 'asc' } } },
      });
      return {
        ...toPublicDeck(deck, deck.cards.length),
        cards: deck.cards.map(toPublicCard),
      };
    },

    async generateDeck(userId: string, input: GenerateDeckInput) {
      const source = await resolveSourceMaterial(userId, input.noteId, input.topic);
      const prompt = `Generate exactly ${input.count} university-level study flashcards from the following material.
Return JSON with shape: { "title": "short deck title", "cards": [{ "front": "question or term", "back": "concise accurate answer" }] }.

${source.sourceText}`;

      const generated = await generateValidatedJson(llm, prompt, aiDeckOutputSchema, logger);
      const deck = await prisma.deck.create({
        data: {
          userId,
          noteId: source.noteId,
          title: generated.title,
          topic: source.topic,
          cards: {
            create: generated.cards.slice(0, input.count).map((c, idx) => ({
              front: c.front,
              back: c.back,
              position: idx,
            })),
          },
        },
        include: { cards: { orderBy: { position: 'asc' } } },
      });

      return {
        ...toPublicDeck(deck, deck.cards.length),
        cards: deck.cards.map(toPublicCard),
      };
    },

    async getDeck(userId: string, deckId: string) {
      const deck = await prisma.deck.findFirst({
        where: { id: deckId, userId },
        include: { cards: { orderBy: { position: 'asc' } } },
      });
      if (!deck) throw new AppError('NOT_FOUND', 'Deck not found');
      return {
        ...toPublicDeck(deck, deck.cards.length),
        cards: deck.cards.map(toPublicCard),
      };
    },

    async updateDeck(userId: string, deckId: string, input: UpdateDeckInput) {
      await assertDeckOwned(userId, deckId);
      const updated = await prisma.deck.update({
        where: { id: deckId },
        data: { title: input.title },
        include: { _count: { select: { cards: true } } },
      });
      return toPublicDeck(updated, updated._count.cards);
    },

    async deleteDeck(userId: string, deckId: string) {
      await assertDeckOwned(userId, deckId);
      await prisma.deck.delete({ where: { id: deckId } });
    },

    async createCard(userId: string, deckId: string, input: CreateCardInput) {
      await assertDeckOwned(userId, deckId);
      const count = await prisma.card.count({ where: { deckId } });
      const card = await prisma.card.create({
        data: { deckId, front: input.front, back: input.back, position: count },
      });
      return toPublicCard(card);
    },

    async updateCard(userId: string, cardId: string, input: UpdateCardInput) {
      const card = await prisma.card.findFirst({
        where: { id: cardId, deck: { userId } },
      });
      if (!card) throw new AppError('NOT_FOUND', 'Card not found');
      const updated = await prisma.card.update({
        where: { id: cardId },
        data: input,
      });
      return toPublicCard(updated);
    },

    async deleteCard(userId: string, cardId: string) {
      const card = await prisma.card.findFirst({
        where: { id: cardId, deck: { userId } },
      });
      if (!card) throw new AppError('NOT_FOUND', 'Card not found');
      await prisma.card.delete({ where: { id: cardId } });
    },

    // --------------------------------------------------------- Quizzes & Attempts
    async listQuizzes(userId: string): Promise<PublicQuizSummary[]> {
      const quizzes = await prisma.quiz.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { questions: true } },
          attempts: {
            orderBy: { takenAt: 'desc' },
            select: { score: true, total: true },
          },
        },
      });

      return quizzes.map((q) => {
        const ratios = q.attempts.map((a) => (a.total > 0 ? a.score / a.total : 0));
        return {
          id: q.id,
          title: q.title,
          topic: q.topic,
          noteId: q.noteId,
          questionCount: q._count.questions,
          attempts: q.attempts.length,
          bestScore: ratios.length > 0 ? Math.round(Math.max(...ratios) * 100) / 100 : null,
          lastScore: ratios.length > 0 ? Math.round((ratios[0] ?? 0) * 100) / 100 : null,
          createdAt: q.createdAt,
        };
      });
    },

    async generateQuiz(userId: string, input: GenerateQuizInput): Promise<PublicQuizToTake> {
      const source = await resolveSourceMaterial(userId, input.noteId, input.topic);
      const prompt = `Generate exactly ${input.count} multiple-choice quiz questions from the following material.
Each question must have 4 options, a 0-based correctIndex (0..3), and a brief explanation.
Return JSON with shape: { "title": "short quiz title", "questions": [{ "prompt": "question", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "why" }] }.

${source.sourceText}`;

      const generated = await generateValidatedJson(llm, prompt, aiQuizOutputSchema, logger);
      const quiz = await prisma.quiz.create({
        data: {
          userId,
          noteId: source.noteId,
          title: generated.title,
          topic: source.topic,
          questions: {
            create: generated.questions.slice(0, input.count).map((q, idx) => ({
              position: idx,
              prompt: q.prompt,
              options: q.options,
              correctIndex: q.correctIndex,
              explanation: q.explanation,
            })),
          },
        },
        include: { questions: { orderBy: { position: 'asc' } } },
      });

      return {
        id: quiz.id,
        title: quiz.title,
        topic: quiz.topic,
        questions: quiz.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: q.options as string[],
        })),
      };
    },

    async getQuiz(userId: string, quizId: string): Promise<PublicQuizToTake> {
      const quiz = await prisma.quiz.findFirst({
        where: { id: quizId, userId },
        include: { questions: { orderBy: { position: 'asc' } } },
      });
      if (!quiz) throw new AppError('NOT_FOUND', 'Quiz not found');

      // Never leak correctIndex or explanation before submission.
      return {
        id: quiz.id,
        title: quiz.title,
        topic: quiz.topic,
        questions: quiz.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: q.options as string[],
        })),
      };
    },

    async deleteQuiz(userId: string, quizId: string) {
      const quiz = await prisma.quiz.findFirst({ where: { id: quizId, userId } });
      if (!quiz) throw new AppError('NOT_FOUND', 'Quiz not found');
      await prisma.quiz.delete({ where: { id: quizId } });
    },

    async submitAttempt(userId: string, quizId: string, input: SubmitAttemptInput) {
      const quiz = await prisma.quiz.findFirst({
        where: { id: quizId, userId },
        include: { questions: { orderBy: { position: 'asc' } } },
      });
      if (!quiz) throw new AppError('NOT_FOUND', 'Quiz not found');

      if (input.answers.length !== quiz.questions.length) {
        throw new AppError(
          'VALIDATION_ERROR',
          `Expected ${quiz.questions.length} answers, got ${input.answers.length}`,
        );
      }

      let score = 0;
      const results = quiz.questions.map((q, idx) => {
        const chosenIndex = input.answers[idx] ?? null;
        const correct = chosenIndex === q.correctIndex;
        if (correct) score += 1;
        return {
          questionId: q.id,
          chosenIndex,
          correctIndex: q.correctIndex,
          correct,
          explanation: q.explanation,
        };
      });

      const attempt = await prisma.quizAttempt.create({
        data: {
          quizId: quiz.id,
          userId,
          answers: input.answers,
          score,
          total: quiz.questions.length,
        },
      });

      return {
        attemptId: attempt.id,
        score: attempt.score,
        total: attempt.total,
        takenAt: attempt.takenAt,
        results,
      };
    },

    async listQuizAttempts(userId: string, quizId: string) {
      const quiz = await prisma.quiz.findFirst({ where: { id: quizId, userId } });
      if (!quiz) throw new AppError('NOT_FOUND', 'Quiz not found');
      return prisma.quizAttempt.findMany({
        where: { quizId, userId },
        orderBy: { takenAt: 'desc' },
        select: { id: true, score: true, total: true, takenAt: true },
      });
    },

    async listAllAttempts(userId: string, query: QuizAttemptsRangeQuery) {
      const from = query.from ? new Date(query.from) : undefined;
      const to = query.to ? new Date(query.to) : undefined;
      return prisma.quizAttempt.findMany({
        where: {
          userId,
          ...(from || to
            ? {
                takenAt: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
        orderBy: { takenAt: 'asc' },
        select: {
          id: true,
          quizId: true,
          score: true,
          total: true,
          takenAt: true,
          quiz: { select: { title: true } },
        },
      });
    },
  };
}

export type StudyService = ReturnType<typeof createStudyService>;

