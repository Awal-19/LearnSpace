import type { Card, Deck, PrismaClient, ReviewRating, UsageFeature } from '@prisma/client';
import type { Logger } from 'pino';
import type { z } from 'zod';
import { AppError } from '../../lib/errors';
import { sharpSafe } from '../../lib/fileSafety';
import type { LLMProvider } from '../../lib/llm/provider';
import { detectImageMime, type StorageService } from '../../lib/storage';
import { recordUsageEvent } from '../admin/admin.logging';
import { acquireAiConcurrency, enforceAiQuota } from '../ai/aiQuota';
import { localDateTimeParts } from '../timetable/timetable.service';
import {
  aiDeckOutputSchema,
  aiQuizOutputSchema,
  type CreateCardInput,
  type CreateDeckInput,
  type GenerateDeckInput,
  type GenerateQuizInput,
  type ImportCsvInput,
  type ListQuizzesQuery,
  type PaginationQuery,
  type QuizAttemptsRangeQuery,
  type ReviewCardInput,
  type SubmitAttemptInput,
  type UpdateCardInput,
  type UpdateDeckInput,
  type UpdateQuizInput,
} from './study.schemas';
import { computeSm2Review, formatIntervalHint, parseFlashcardCsv } from './study.sm2';

export interface PublicDeck {
  id: string;
  title: string;
  topic: string | null;
  noteId: string | null;
  documentId: string | null;
  courseId: string | null;
  cardCount: number;
  dueCount: number;
  masteredCount: number;
  accuracy: number | null;
  reviewCount: number;
  streakDays: number;
  createdAt: Date;
}

export interface PublicCard {
  id: string;
  front: string;
  back: string;
  topic: string | null;
  imageUrl: string | null;
  position: number;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  dueAt: Date;
  lastReviewedAt: Date | null;
  mastered: boolean;
  accuracy: number | null;
  reviewCount: number;
  intervalHints: {
    again: string;
    hard: string;
    good: string;
    easy: string;
  };
}

export interface PublicQuizSummary {
  id: string;
  title: string;
  topic: string | null;
  noteId: string | null;
  courseId: string | null;
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
  courseId: string | null;
  questions: Array<{ id: string; prompt: string; options: string[] }>;
}

export interface StudyServiceDeps {
  prisma: PrismaClient;
  llm: LLMProvider;
  logger: Logger;
  storage?: StorageService;
  dailyTokenLimit?: number | null;
}

export const MAX_CARD_IMAGE_BYTES = 5 * 1024 * 1024;

function stripJsonFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function utcDayBounds(now: Date = new Date()): { dayDate: Date } {
  const dayStr = now.toISOString().slice(0, 10);
  return { dayDate: new Date(`${dayStr}T00:00:00.000Z`) };
}

function shiftDateString(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function computeReviewStreak(dayKeys: Set<string>, timeZone: string, now: Date): number {
  if (dayKeys.size === 0) return 0;
  const todayStr = localDateTimeParts(now, timeZone).dateStr;
  const yesterdayStr = shiftDateString(todayStr, -1);
  let cursor = dayKeys.has(todayStr) ? todayStr : dayKeys.has(yesterdayStr) ? yesterdayStr : '';
  if (!cursor) return 0;
  let streak = 0;
  while (dayKeys.has(cursor)) {
    streak += 1;
    cursor = shiftDateString(cursor, -1);
  }
  return streak;
}

function isCardMastered(card: { repetitions?: number; intervalDays?: number }): boolean {
  return (card.repetitions ?? 0) >= 3 && (card.intervalDays ?? 0) >= 21;
}

interface ReviewLogLite {
  cardId: string;
  deckId: string;
  rating: ReviewRating;
  reviewedAt: Date;
}

async function generateValidatedJson<T>(
  llm: LLMProvider,
  prompt: string,
  schema: z.ZodType<T>,
  logger: Logger,
): Promise<{ data: T; usage: { inputTokens: number; outputTokens: number } }> {
  if (!llm.isConfigured()) {
    throw new AppError('AI_UNAVAILABLE', 'AI generator is not available right now');
  }

  let lastError: string | null = null;
  let totalIn = 0;
  let totalOut = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const fullPrompt =
      attempt === 0
        ? prompt
        : `${prompt}\n\nIMPORTANT: Your previous output was invalid (${lastError}). Return ONLY valid JSON matching the exact schema.`;

    const res = await llm.generateText(fullPrompt, {
      systemPrompt: 'You output strictly valid JSON with no markdown or extra commentary.',
      temperature: 0.3,
      maxOutputTokens: 3000,
      responseMimeType: 'application/json',
    });

    totalIn += res.usage?.inputTokens ?? Math.ceil(fullPrompt.length / 4);
    totalOut += res.usage?.outputTokens ?? Math.ceil(res.text.length / 4);

    try {
      const parsed = JSON.parse(stripJsonFences(res.text));
      const validated = schema.safeParse(parsed);
      if (validated.success) {
        return {
          data: validated.data,
          usage: { inputTokens: totalIn, outputTokens: totalOut },
        };
      }
      lastError = validated.error.issues.map((i) => i.message).join('; ');
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Invalid JSON';
    }
    logger.warn({ attempt, lastError }, 'AI JSON generation validation failed');
  }

  throw new AppError('AI_BAD_OUTPUT', 'The AI returned an invalid structure. Please try again.');
}

function toPublicCard(c: Card, stats?: { reviewCount: number; passedCount: number }): PublicCard {
  const easeFactor = (c as { easeFactor?: number }).easeFactor ?? 2.5;
  const intervalDays = (c as { intervalDays?: number }).intervalDays ?? 0;
  const repetitions = (c as { repetitions?: number }).repetitions ?? 0;
  const lapses = (c as { lapses?: number }).lapses ?? 0;
  const dueAt = (c as { dueAt?: Date }).dueAt ?? c.createdAt;
  const lastReviewedAt = (c as { lastReviewedAt?: Date | null }).lastReviewedAt ?? null;
  const topic = (c as { topic?: string | null }).topic ?? null;
  const imageUrl = (c as { imageUrl?: string | null }).imageUrl ?? null;
  const reviewCount = stats?.reviewCount ?? 0;
  const accuracy =
    reviewCount > 0 ? Math.round(((stats?.passedCount ?? 0) / reviewCount) * 100) : null;

  const sm2State = { easeFactor, intervalDays, repetitions, lapses };
  const now = new Date();
  const intervalHints = {
    again: formatIntervalHint(computeSm2Review(sm2State, 'again', now).nextInterval),
    hard: formatIntervalHint(computeSm2Review(sm2State, 'hard', now).nextInterval),
    good: formatIntervalHint(computeSm2Review(sm2State, 'good', now).nextInterval),
    easy: formatIntervalHint(computeSm2Review(sm2State, 'easy', now).nextInterval),
  };

  return {
    id: c.id,
    front: c.front,
    back: c.back,
    topic,
    imageUrl,
    position: c.position,
    easeFactor,
    intervalDays,
    repetitions,
    lapses,
    dueAt,
    lastReviewedAt,
    mastered: isCardMastered({ repetitions, intervalDays }),
    accuracy,
    reviewCount,
    intervalHints,
  };
}

function toPublicDeck(
  d: Deck,
  cardCount: number,
  extra?: {
    dueCount?: number;
    masteredCount?: number;
    accuracy?: number | null;
    reviewCount?: number;
    streakDays?: number;
  },
): PublicDeck {
  return {
    id: d.id,
    title: d.title,
    topic: d.topic,
    noteId: d.noteId,
    documentId: (d as { documentId?: string | null }).documentId ?? null,
    courseId: (d as { courseId?: string | null }).courseId ?? null,
    cardCount,
    dueCount: extra?.dueCount ?? cardCount,
    masteredCount: extra?.masteredCount ?? 0,
    accuracy: extra?.accuracy ?? null,
    reviewCount: extra?.reviewCount ?? 0,
    streakDays: extra?.streakDays ?? 0,
    createdAt: d.createdAt,
  };
}

export function createStudyService({
  prisma,
  llm,
  logger,
  storage,
  dailyTokenLimit,
}: StudyServiceDeps) {
  async function assertCourseOwnedIfPresent(userId: string, courseId?: string | null) {
    if (!courseId) return;
    const course = await prisma.course.findFirst({ where: { id: courseId, userId } });
    if (!course) throw new AppError('NOT_FOUND', 'Course not found');
  }

  async function getUserTimezone(userId: string): Promise<string> {
    if (!prisma.userSettings?.findUnique) return 'UTC';
    const settings = await prisma.userSettings
      .findUnique({ where: { userId }, select: { timezone: true } })
      .catch(() => null);
    return settings?.timezone || 'UTC';
  }

  async function assertWithinDailyQuota(userId: string) {
    if (!dailyTokenLimit || dailyTokenLimit <= 0 || !prisma.aiUsageDaily?.findUnique) return;
    const { dayDate } = utcDayBounds();
    const row = await prisma.aiUsageDaily.findUnique({
      where: { userId_day: { userId, day: dayDate } },
    });
    const used = (row?.inputTokens ?? 0) + (row?.outputTokens ?? 0);
    if (used >= dailyTokenLimit) {
      throw new AppError('AI_BUDGET_EXCEEDED', 'Daily AI token limit reached. Try again tomorrow.');
    }
  }

  async function recordAiUsage(
    userId: string,
    feature: UsageFeature,
    route: string,
    startedMs: number,
    usage: { inputTokens: number; outputTokens: number },
    status: 'success' | 'error' = 'success',
    errorCode?: string,
  ) {
    const { dayDate } = utcDayBounds();
    const tasks: Array<Promise<unknown>> = [
      recordUsageEvent(prisma, {
        userId,
        feature,
        model: llm.modelName,
        tokensIn: usage.inputTokens,
        tokensOut: usage.outputTokens,
        durationMs: Date.now() - startedMs,
        status,
        errorCode: errorCode ?? null,
        route,
      }),
    ];
    if (status === 'success' && prisma.aiUsageDaily?.upsert) {
      tasks.push(
        prisma.aiUsageDaily
          .upsert({
            where: { userId_day: { userId, day: dayDate } },
            create: {
              userId,
              day: dayDate,
              inputTokens: usage.inputTokens,
              outputTokens: usage.outputTokens,
              requests: 1,
            },
            update: {
              inputTokens: { increment: usage.inputTokens },
              outputTokens: { increment: usage.outputTokens },
              requests: { increment: 1 },
            },
          })
          .catch((err) => logger.warn({ err }, 'Failed to update ai_usage_daily')),
      );
    }
    await Promise.all(tasks);
  }

  async function resolveSourceMaterial(
    userId: string,
    opts: { noteId?: string; documentId?: string; topic?: string },
  ) {
    if (opts.noteId) {
      const note = await prisma.note.findFirst({ where: { id: opts.noteId, userId } });
      if (!note) throw new AppError('NOT_FOUND', 'Note not found');
      if (note.body.trim().length < 30) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Note needs at least 30 characters to generate study material',
        );
      }
      return {
        noteId: note.id,
        documentId: null,
        courseId: note.courseId ?? null,
        topic: note.title,
        sourceText: `Title: ${note.title}\n\nContent:\n${note.body.slice(0, 8000)}`,
      };
    }

    if (opts.documentId) {
      const doc = await prisma.document?.findFirst({
        where: { id: opts.documentId, userId },
      });
      if (!doc) throw new AppError('NOT_FOUND', 'Document not found');
      if (doc.status !== 'ready' || doc.extractedText.trim().length < 30) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Document must finish processing and have extractable text before generating study material',
        );
      }
      return {
        noteId: null,
        documentId: doc.id,
        courseId: doc.courseId ?? null,
        topic: doc.title,
        sourceText: `Document: ${doc.title}\n\nExtracted text:\n${doc.extractedText.slice(0, 10000)}`,
      };
    }

    return {
      noteId: null,
      documentId: null,
      courseId: null,
      topic: opts.topic ?? 'General study',
      sourceText: `Topic: ${opts.topic}`,
    };
  }

  async function assertDeckOwned(userId: string, deckId: string) {
    const deck = await prisma.deck.findFirst({ where: { id: deckId, userId } });
    if (!deck) throw new AppError('NOT_FOUND', 'Deck not found');
    return deck;
  }

  async function fetchReviewLogs(userId: string, deckIds?: string[]): Promise<ReviewLogLite[]> {
    if (!prisma.reviewLog?.findMany) return [];
    if (deckIds && deckIds.length === 0) return [];
    return prisma.reviewLog.findMany({
      where: {
        userId,
        ...(deckIds ? { deckId: { in: deckIds } } : {}),
      },
      select: { cardId: true, deckId: true, rating: true, reviewedAt: true },
    });
  }

  function summarizeDeckStats(
    cardsList: Array<{ dueAt?: Date; repetitions?: number; intervalDays?: number }>,
    logs: ReviewLogLite[],
    tz: string,
    now: Date,
  ) {
    const dueCount = cardsList.filter(
      (c) => ((c.dueAt ?? new Date(0)) as Date).getTime() <= now.getTime(),
    ).length;
    const masteredCount = cardsList.filter((c) => isCardMastered(c)).length;
    const reviewCount = logs.length;
    const passedCount = logs.filter((l) => l.rating !== 'again').length;
    const accuracy = reviewCount > 0 ? Math.round((passedCount / reviewCount) * 100) : null;
    const dayKeys = new Set(logs.map((l) => localDateTimeParts(l.reviewedAt, tz).dateStr));
    const streakDays = computeReviewStreak(dayKeys, tz, now);
    return { dueCount, masteredCount, reviewCount, accuracy, streakDays };
  }

  function buildCardStatsMap(logs: ReviewLogLite[]) {
    const map = new Map<string, { reviewCount: number; passedCount: number }>();
    for (const log of logs) {
      const cur = map.get(log.cardId) ?? { reviewCount: 0, passedCount: 0 };
      cur.reviewCount += 1;
      if (log.rating !== 'again') cur.passedCount += 1;
      map.set(log.cardId, cur);
    }
    return map;
  }

  return {
    // --------------------------------------------------------- Decks & Cards
    async listDecks(userId: string, query: PaginationQuery) {
      const courseFilter =
        query.courseId === 'none'
          ? { courseId: null }
          : query.courseId
            ? { courseId: query.courseId }
            : {};

      const rows = await prisma.deck.findMany({
        where: { userId, ...courseFilter },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        include: { _count: { select: { cards: true } } },
      });
      const hasMore = rows.length > query.limit;
      const sliced = hasMore ? rows.slice(0, query.limit) : rows;
      const deckIds = sliced.map((d) => d.id);
      const now = new Date();
      const [tz, cardRows, logRows] = await Promise.all([
        getUserTimezone(userId),
        deckIds.length > 0 && prisma.card?.findMany
          ? prisma.card.findMany({
              where: { deckId: { in: deckIds } },
              select: { deckId: true, dueAt: true, repetitions: true, intervalDays: true },
            })
          : Promise.resolve([]),
        fetchReviewLogs(userId, deckIds),
      ]);

      const cardsByDeck = new Map<string, typeof cardRows>();
      for (const c of cardRows) {
        const list = cardsByDeck.get(c.deckId) ?? [];
        list.push(c);
        cardsByDeck.set(c.deckId, list);
      }

      const logsByDeck = new Map<string, ReviewLogLite[]>();
      for (const l of logRows) {
        const list = logsByDeck.get(l.deckId) ?? [];
        list.push(l);
        logsByDeck.set(l.deckId, list);
      }

      return {
        items: sliced.map((d) => {
          const deckCards = cardsByDeck.get(d.id);
          const deckLogs = logsByDeck.get(d.id) ?? [];
          if (!deckCards) {
            return toPublicDeck(d, d._count.cards, {
              dueCount: d._count.cards,
              masteredCount: 0,
              accuracy: null,
              reviewCount: 0,
              streakDays: 0,
            });
          }
          const stats = summarizeDeckStats(deckCards, deckLogs, tz, now);
          return toPublicDeck(d, d._count.cards, stats);
        }),
        nextCursor: hasMore ? (sliced.at(-1)?.id ?? null) : null,
      };
    },

    async getDueSummary(userId: string) {
      const now = new Date();
      const tz = await getUserTimezone(userId);
      const todayStr = localDateTimeParts(now, tz).dateStr;

      const [dueCards, allLogs] = await Promise.all([
        prisma.card?.findMany
          ? prisma.card.findMany({
              where: { dueAt: { lte: now }, deck: { userId } },
              select: {
                id: true,
                deckId: true,
                deck: { select: { id: true, title: true, courseId: true } },
              },
            })
          : Promise.resolve([]),
        fetchReviewLogs(userId),
      ]);

      const deckMap = new Map<
        string,
        { deckId: string; title: string; courseId: string | null; dueCount: number }
      >();
      for (const c of dueCards) {
        const existing = deckMap.get(c.deckId);
        if (existing) {
          existing.dueCount += 1;
        } else {
          deckMap.set(c.deckId, {
            deckId: c.deckId,
            title: c.deck.title,
            courseId: c.deck.courseId ?? null,
            dueCount: 1,
          });
        }
      }

      const dayKeys = new Set<string>();
      let reviewedTodayCount = 0;
      for (const l of allLogs) {
        const dayStr = localDateTimeParts(l.reviewedAt, tz).dateStr;
        dayKeys.add(dayStr);
        if (dayStr === todayStr) reviewedTodayCount += 1;
      }

      return {
        dueTodayCount: dueCards.length,
        reviewedTodayCount,
        streakDays: computeReviewStreak(dayKeys, tz, now),
        decks: Array.from(deckMap.values()).sort((a, b) => b.dueCount - a.dueCount),
      };
    },

    async createDeck(userId: string, input: CreateDeckInput) {
      await assertCourseOwnedIfPresent(userId, input.courseId);
      const cardsData = (input.cards ?? []).map((c, idx) => ({
        front: c.front,
        back: c.back,
        topic: c.topic ?? null,
        position: idx,
      }));
      const deck = await prisma.deck.create({
        data: {
          userId,
          title: input.title,
          topic: input.topic ?? null,
          courseId: input.courseId ?? null,
          ...(cardsData.length > 0 ? { cards: { create: cardsData } } : {}),
        },
        include: { cards: { orderBy: { position: 'asc' } } },
      });
      return {
        ...toPublicDeck(deck, deck.cards.length, {
          dueCount: deck.cards.length,
          masteredCount: 0,
          accuracy: null,
          reviewCount: 0,
          streakDays: 0,
        }),
        cards: deck.cards.map((c) => toPublicCard(c)),
      };
    },

    async generateDeck(userId: string, input: GenerateDeckInput) {
      await assertWithinDailyQuota(userId);
      await assertCourseOwnedIfPresent(userId, input.courseId);
      const source = await resolveSourceMaterial(userId, {
        noteId: input.noteId,
        documentId: input.documentId,
        topic: input.topic,
      });
      const resolvedCourseId = input.courseId !== undefined ? input.courseId : source.courseId;
      const prompt = `Generate exactly ${input.count} university-level study flashcards from the following material.
Return JSON with shape: { "title": "short deck title", "cards": [{ "front": "question or term", "back": "concise accurate answer", "topic": "short subtopic label" }] }.

${source.sourceText}`;

      await enforceAiQuota(prisma, userId, null);
      const releaseSlot = acquireAiConcurrency(userId);
      const startedMs = Date.now();
      let generated;
      try {
        const res = await generateValidatedJson(llm, prompt, aiDeckOutputSchema, logger);
        generated = res.data;
        await recordAiUsage(userId, 'flashcards', 'POST /decks/generate', startedMs, res.usage);
      } catch (err) {
        const errorCode = err instanceof AppError ? err.code : 'AI_PROVIDER_ERROR';
        await recordAiUsage(
          userId,
          'flashcards',
          'POST /decks/generate',
          startedMs,
          { inputTokens: Math.ceil(prompt.length / 4), outputTokens: 0 },
          'error',
          errorCode,
        );
        throw err;
      } finally {
        releaseSlot();
      }

      const deck = await prisma.deck.create({
        data: {
          userId,
          noteId: source.noteId,
          documentId: source.documentId,
          courseId: resolvedCourseId,
          title: generated.title,
          topic: source.topic,
          cards: {
            create: generated.cards.slice(0, input.count).map((c, idx) => ({
              front: c.front,
              back: c.back,
              topic: c.topic?.slice(0, 160) ?? source.topic.slice(0, 160),
              position: idx,
            })),
          },
        },
        include: { cards: { orderBy: { position: 'asc' } } },
      });

      return {
        ...toPublicDeck(deck, deck.cards.length, {
          dueCount: deck.cards.length,
          masteredCount: 0,
          accuracy: null,
          reviewCount: 0,
          streakDays: 0,
        }),
        cards: deck.cards.map((c) => toPublicCard(c)),
      };
    },

    async getDeck(userId: string, deckId: string) {
      const deck = await prisma.deck.findFirst({
        where: { id: deckId, userId },
        include: { cards: { orderBy: { position: 'asc' } } },
      });
      if (!deck) throw new AppError('NOT_FOUND', 'Deck not found');
      const now = new Date();
      const [tz, logs] = await Promise.all([
        getUserTimezone(userId),
        fetchReviewLogs(userId, [deck.id]),
      ]);
      const cardStats = buildCardStatsMap(logs);
      const stats = summarizeDeckStats(deck.cards, logs, tz, now);
      return {
        ...toPublicDeck(deck, deck.cards.length, stats),
        cards: deck.cards.map((c) => toPublicCard(c, cardStats.get(c.id))),
      };
    },

    async getDueCards(userId: string, deckId: string) {
      const deck = await prisma.deck.findFirst({
        where: { id: deckId, userId },
        include: { cards: { orderBy: [{ dueAt: 'asc' }, { position: 'asc' }] } },
      });
      if (!deck) throw new AppError('NOT_FOUND', 'Deck not found');
      const now = new Date();
      const [tz, logs] = await Promise.all([
        getUserTimezone(userId),
        fetchReviewLogs(userId, [deck.id]),
      ]);
      const cardStats = buildCardStatsMap(logs);
      const stats = summarizeDeckStats(deck.cards, logs, tz, now);
      const dueCards = deck.cards.filter(
        (c) => (((c as { dueAt?: Date }).dueAt ?? c.createdAt) as Date).getTime() <= now.getTime(),
      );
      return {
        deck: toPublicDeck(deck, deck.cards.length, stats),
        cards: dueCards.map((c) => toPublicCard(c, cardStats.get(c.id))),
      };
    },

    async updateDeck(userId: string, deckId: string, input: UpdateDeckInput) {
      await assertDeckOwned(userId, deckId);
      await assertCourseOwnedIfPresent(userId, input.courseId);
      const updated = await prisma.deck.update({
        where: { id: deckId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
        },
        include: { _count: { select: { cards: true } } },
      });
      const now = new Date();
      const [tz, cardRows, logs] = await Promise.all([
        getUserTimezone(userId),
        prisma.card?.findMany
          ? prisma.card.findMany({
              where: { deckId },
              select: { dueAt: true, repetitions: true, intervalDays: true },
            })
          : Promise.resolve([]),
        fetchReviewLogs(userId, [deckId]),
      ]);
      const stats = summarizeDeckStats(cardRows, logs, tz, now);
      return toPublicDeck(updated, updated._count.cards, stats);
    },

    async deleteDeck(userId: string, deckId: string) {
      await assertDeckOwned(userId, deckId);
      const imageCards =
        storage && prisma.card?.findMany
          ? await prisma.card.findMany({
              where: { deckId, imageStorageKey: { not: null } },
              select: { imageStorageKey: true },
            })
          : [];
      await prisma.deck.delete({ where: { id: deckId } });
      if (storage && imageCards.length > 0) {
        await Promise.all(
          imageCards.map((c) =>
            c.imageStorageKey
              ? storage.deleteAttachment(c.imageStorageKey, 'image').catch(() => undefined)
              : Promise.resolve(),
          ),
        );
      }
    },

    async createCard(userId: string, deckId: string, input: CreateCardInput) {
      const deck = await assertDeckOwned(userId, deckId);
      const count = await prisma.card.count({ where: { deckId } });
      const card = await prisma.card.create({
        data: {
          deckId,
          front: input.front,
          back: input.back,
          topic: input.topic ?? deck.topic?.slice(0, 160) ?? null,
          position: count,
        },
      });
      return toPublicCard(card);
    },

    async importCardsCsv(userId: string, deckId: string, input: ImportCsvInput) {
      const deck = await assertDeckOwned(userId, deckId);
      const parsed = parseFlashcardCsv(input.csvText, input.hasHeader);
      const startPosition = await prisma.card.count({ where: { deckId } });
      const defaultTopic = deck.topic?.slice(0, 160) ?? null;

      const createdCards = await prisma.$transaction(async (tx) => {
        const created: Card[] = [];
        for (let idx = 0; idx < parsed.cards.length; idx += 1) {
          const item = parsed.cards[idx]!;
          const row = await tx.card.create({
            data: {
              deckId,
              front: item.front,
              back: item.back,
              topic: item.topic ?? defaultTopic,
              position: startPosition + idx,
            },
          });
          created.push(row);
        }
        await tx.deck.update({
          where: { id: deckId },
          data: { updatedAt: new Date() },
        });
        return created;
      });

      return {
        importedCount: createdCards.length,
        skippedRows: parsed.skippedRows,
        cards: createdCards.map((c) => toPublicCard(c)),
      };
    },

    async updateCard(userId: string, cardId: string, input: UpdateCardInput) {
      const card = await prisma.card.findFirst({
        where: { id: cardId, deck: { userId } },
      });
      if (!card) throw new AppError('NOT_FOUND', 'Card not found');
      const updated = await prisma.card.update({
        where: { id: cardId },
        data: {
          ...(input.front !== undefined ? { front: input.front } : {}),
          ...(input.back !== undefined ? { back: input.back } : {}),
          ...(input.topic !== undefined ? { topic: input.topic } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
        },
      });
      const logs = await fetchReviewLogs(userId, [card.deckId]);
      const cardStats = buildCardStatsMap(logs).get(cardId);
      return toPublicCard(updated, cardStats);
    },

    async deleteCard(userId: string, cardId: string) {
      const card = await prisma.card.findFirst({
        where: { id: cardId, deck: { userId } },
      });
      if (!card) throw new AppError('NOT_FOUND', 'Card not found');
      await prisma.card.delete({ where: { id: cardId } });
      if (storage && (card as { imageStorageKey?: string | null }).imageStorageKey) {
        await storage
          .deleteAttachment((card as { imageStorageKey: string }).imageStorageKey, 'image')
          .catch(() => undefined);
      }
    },

    async reviewCard(userId: string, cardId: string, input: ReviewCardInput) {
      const card = await prisma.card.findFirst({
        where: { id: cardId, deck: { userId } },
        include: { deck: { select: { id: true, courseId: true, topic: true } } },
      });
      if (!card) throw new AppError('NOT_FOUND', 'Card not found');

      const now = new Date();
      const outcome = computeSm2Review(
        {
          easeFactor: (card as { easeFactor?: number }).easeFactor ?? 2.5,
          intervalDays: (card as { intervalDays?: number }).intervalDays ?? 0,
          repetitions: (card as { repetitions?: number }).repetitions ?? 0,
          lapses: (card as { lapses?: number }).lapses ?? 0,
        },
        input.rating,
        now,
      );

      const topicLabel =
        ((card as { topic?: string | null }).topic ?? card.deck?.topic ?? null)?.slice(0, 160) ??
        null;

      const { updatedCard, log } = await prisma.$transaction(async (tx) => {
        const updatedCard = await tx.card.update({
          where: { id: card.id },
          data: {
            easeFactor: outcome.easeFactor,
            intervalDays: outcome.nextInterval,
            repetitions: outcome.repetitions,
            lapses: outcome.lapses,
            dueAt: outcome.dueAt,
            lastReviewedAt: outcome.lastReviewedAt,
          },
        });
        const log = await tx.reviewLog.create({
          data: {
            userId,
            cardId: card.id,
            deckId: card.deckId,
            courseId: card.deck?.courseId ?? null,
            topic: topicLabel,
            rating: outcome.rating,
            quality: outcome.quality,
            previousInterval: outcome.previousInterval,
            nextInterval: outcome.nextInterval,
            easeFactorAfter: outcome.easeFactor,
            reviewedAt: now,
          },
        });
        return { updatedCard, log };
      });

      const logs = await fetchReviewLogs(userId, [card.deckId]);
      const cardStats = buildCardStatsMap(logs).get(card.id);
      const deckDueCount = prisma.card?.findMany
        ? (
            await prisma.card.findMany({
              where: { deckId: card.deckId, dueAt: { lte: now } },
              select: { id: true },
            })
          ).length
        : 0;

      return {
        card: toPublicCard(updatedCard, cardStats),
        review: {
          id: log.id,
          rating: log.rating,
          quality: log.quality,
          previousInterval: log.previousInterval,
          nextInterval: log.nextInterval,
          easeFactorAfter: log.easeFactorAfter,
          dueAt: outcome.dueAt,
          reviewedAt: log.reviewedAt,
        },
        deckDueCount,
      };
    },

    async uploadCardImage(userId: string, cardId: string, buffer: Buffer) {
      const card = await prisma.card.findFirst({
        where: { id: cardId, deck: { userId } },
      });
      if (!card) throw new AppError('NOT_FOUND', 'Card not found');
      if (!storage?.isConfigured()) {
        throw new AppError('STORAGE_UNAVAILABLE', 'Image storage is not configured');
      }

      if (!detectImageMime(buffer)) {
        throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Upload a PNG, JPEG, or WebP image');
      }

      let processed: Buffer;
      try {
        processed = await sharpSafe(buffer)
          .rotate()
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
      } catch {
        throw new AppError(
          'UNSUPPORTED_MEDIA_TYPE',
          'Could not decode image file. Choose a valid JPG, PNG, or WebP photo.',
        );
      }

      const uploaded = await storage.uploadAttachment(processed, userId, 'image', 'webp');
      const previousKey = (card as { imageStorageKey?: string | null }).imageStorageKey;
      const imageUrl = `/api/v1/cards/${card.id}/image?v=${Date.now()}`;

      const updated = await prisma.card.update({
        where: { id: card.id },
        data: {
          imageStorageKey: uploaded.storageKey,
          imageUrl,
        },
      });

      if (previousKey && previousKey !== uploaded.storageKey) {
        await storage.deleteAttachment(previousKey, 'image').catch(() => undefined);
      }

      const logs = await fetchReviewLogs(userId, [card.deckId]);
      return toPublicCard(updated, buildCardStatsMap(logs).get(card.id));
    },

    async readCardImage(userId: string, cardId: string): Promise<Buffer> {
      const card = await prisma.card.findFirst({
        where: { id: cardId, deck: { userId } },
      });
      const storageKey = (card as { imageStorageKey?: string | null } | null)?.imageStorageKey;
      const imageUrl = (card as { imageUrl?: string | null } | null)?.imageUrl;
      if (!card || !storageKey) {
        throw new AppError('NOT_FOUND', 'Card image not found');
      }
      if (!storage?.isConfigured()) {
        throw new AppError('STORAGE_UNAVAILABLE', 'Image storage is not configured');
      }
      return storage.readAttachmentBytes(storageKey, imageUrl ?? '', 'image');
    },

    async deleteCardImage(userId: string, cardId: string) {
      const card = await prisma.card.findFirst({
        where: { id: cardId, deck: { userId } },
      });
      if (!card) throw new AppError('NOT_FOUND', 'Card not found');
      const previousKey = (card as { imageStorageKey?: string | null }).imageStorageKey;

      const updated = await prisma.card.update({
        where: { id: card.id },
        data: {
          imageStorageKey: null,
          imageUrl: null,
        },
      });

      if (storage && previousKey) {
        await storage.deleteAttachment(previousKey, 'image').catch(() => undefined);
      }

      const logs = await fetchReviewLogs(userId, [card.deckId]);
      return toPublicCard(updated, buildCardStatsMap(logs).get(card.id));
    },

    // --------------------------------------------------------- Quizzes & Attempts
    async listQuizzes(userId: string, query: ListQuizzesQuery = {}): Promise<PublicQuizSummary[]> {
      const courseFilter =
        query.courseId === 'none'
          ? { courseId: null }
          : query.courseId
            ? { courseId: query.courseId }
            : {};

      const quizzes = await prisma.quiz.findMany({
        where: { userId, ...courseFilter },
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
          courseId: (q as { courseId?: string | null }).courseId ?? null,
          questionCount: q._count.questions,
          attempts: q.attempts.length,
          bestScore: ratios.length > 0 ? Math.round(Math.max(...ratios) * 100) / 100 : null,
          lastScore: ratios.length > 0 ? Math.round((ratios[0] ?? 0) * 100) / 100 : null,
          createdAt: q.createdAt,
        };
      });
    },

    async generateQuiz(userId: string, input: GenerateQuizInput): Promise<PublicQuizToTake> {
      await assertWithinDailyQuota(userId);
      await assertCourseOwnedIfPresent(userId, input.courseId);
      const source = await resolveSourceMaterial(userId, {
        noteId: input.noteId,
        documentId: input.documentId,
        topic: input.topic,
      });
      const resolvedCourseId = input.courseId !== undefined ? input.courseId : source.courseId;
      const prompt = `Generate exactly ${input.count} multiple-choice quiz questions from the following material.
Each question must have 4 options, a 0-based correctIndex (0..3), and a brief explanation.
Return JSON with shape: { "title": "short quiz title", "questions": [{ "prompt": "question", "options": ["A", "B", "C", "D"], "correctIndex": 0, "explanation": "why" }] }.

${source.sourceText}`;

      await enforceAiQuota(prisma, userId, null);
      const releaseSlot = acquireAiConcurrency(userId);
      const startedMs = Date.now();
      let generated;
      try {
        const res = await generateValidatedJson(llm, prompt, aiQuizOutputSchema, logger);
        generated = res.data;
        await recordAiUsage(userId, 'quiz', 'POST /quizzes/generate', startedMs, res.usage);
      } catch (err) {
        const errorCode = err instanceof AppError ? err.code : 'AI_PROVIDER_ERROR';
        await recordAiUsage(
          userId,
          'quiz',
          'POST /quizzes/generate',
          startedMs,
          { inputTokens: Math.ceil(prompt.length / 4), outputTokens: 0 },
          'error',
          errorCode,
        );
        throw err;
      } finally {
        releaseSlot();
      }

      const quiz = await prisma.quiz.create({
        data: {
          userId,
          noteId: source.noteId,
          courseId: resolvedCourseId,
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
        courseId: (quiz as { courseId?: string | null }).courseId ?? null,
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
        courseId: (quiz as { courseId?: string | null }).courseId ?? null,
        questions: quiz.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: q.options as string[],
        })),
      };
    },

    async updateQuiz(
      userId: string,
      quizId: string,
      input: UpdateQuizInput,
    ): Promise<PublicQuizSummary> {
      const existing = await prisma.quiz.findFirst({ where: { id: quizId, userId } });
      if (!existing) throw new AppError('NOT_FOUND', 'Quiz not found');
      await assertCourseOwnedIfPresent(userId, input.courseId);
      const updated = await prisma.quiz.update({
        where: { id: quizId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.courseId !== undefined ? { courseId: input.courseId } : {}),
        },
        include: {
          _count: { select: { questions: true } },
          attempts: {
            orderBy: { takenAt: 'desc' },
            select: { score: true, total: true },
          },
        },
      });
      const ratios = updated.attempts.map((a) => (a.total > 0 ? a.score / a.total : 0));
      return {
        id: updated.id,
        title: updated.title,
        topic: updated.topic,
        noteId: updated.noteId,
        courseId: (updated as { courseId?: string | null }).courseId ?? null,
        questionCount: updated._count.questions,
        attempts: updated.attempts.length,
        bestScore: ratios.length > 0 ? Math.round(Math.max(...ratios) * 100) / 100 : null,
        lastScore: ratios.length > 0 ? Math.round((ratios[0] ?? 0) * 100) / 100 : null,
        createdAt: updated.createdAt,
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
