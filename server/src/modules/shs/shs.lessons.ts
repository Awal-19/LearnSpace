import type { LessonStatus, Prisma, PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import type { GenerateTextOptions, LLMProvider } from '../../lib/llm/provider';
import { recordUsageEvent } from '../admin/admin.logging';
import { screenShsChatContent } from './shs.safety';

export const LESSON_PROMPT_VERSION = 'shs-lesson-v2';
export const LESSON_DISCLAIMER = 'AI-prepared study notes. Check with your teacher and textbook.';
export const LESSON_LOCK_TTL_MS = 3 * 60 * 1000;

export const topicLessonContentSchema = z.object({
  title: z.string().min(2).max(200),
  subjectName: z.string().min(2).max(120),
  schoolYear: z.string().min(2).max(40).default('SHS 1–3'),
  strand: z.string().min(1).max(120).default('Core Syllabus'),
  subStrand: z.string().max(120).default(''),
  estimatedMinutes: z.number().int().min(3).max(30).default(8),
  objectives: z.array(z.string().min(3).max(300)).min(3).max(6),
  introduction: z.string().min(10).max(2000),
  sections: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        heading: z.string().min(2).max(160),
        body: z.string().min(10).max(5000),
        keyTerms: z
          .array(
            z.object({
              term: z.string().min(1).max(100),
              definition: z.string().min(2).max(400),
            }),
          )
          .default([]),
        formulaOrRule: z.string().max(800).nullable().optional(),
        localExample: z.string().max(1200).nullable().optional(),
      }),
    )
    .min(2)
    .max(8),
  workedExamples: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        title: z.string().min(2).max(160),
        problem: z.string().min(4).max(1200),
        steps: z.array(z.string().min(2).max(1000)).min(1).max(10),
        finalAnswer: z.string().min(1).max(500),
        verificationExpr: z.string().max(200).nullable().optional(),
        expectedNumeric: z.number().nullable().optional(),
      }),
    )
    .max(5)
    .default([]),
  commonMistakes: z.array(z.string().min(3).max(400)).min(1).max(6),
  rememberThis: z.array(z.string().min(3).max(400)).min(2).max(6),
  checkYourself: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        question: z.string().min(4).max(600),
        options: z.array(z.string().min(1).max(300)).max(4).optional(),
        answer: z.string().min(1).max(400),
        explanation: z.string().min(2).max(600),
      }),
    )
    .min(3)
    .max(6),
  outsideSyllabus: z.boolean().default(false),
  disclaimer: z.string().default(LESSON_DISCLAIMER),
});

export type TopicLessonContent = z.infer<typeof topicLessonContentSchema>;

export interface TopicInput {
  id: string;
  title: string;
  strand: string | null;
  subStrand: string | null;
  referenceNotes: string | null;
  schoolYear: string | null;
  subject: { name: string; syllabusVersion: string };
}

/** Tracks active in-process background promises so callers/tests can await or deduplicate them. */
const inflightJobs = new Map<string, Promise<void>>();

export function getInflightLessonJob(topicId: string): Promise<void> | undefined {
  return inflightJobs.get(topicId);
}

/**
 * Extracts and parses a JSON object from LLM text, handling optional markdown fences,
 * surrounding prose, and trailing commas.
 */
export function extractJsonObject(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Fall through to slice extraction
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace <= firstBrace) {
    throw new SyntaxError('Output was not valid JSON.');
  }

  const sliced = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(sliced);
  } catch {
    const withoutTrailingCommas = sliced.replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(withoutTrailingCommas);
  }
}

function isTransientProviderError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const anyErr = err as {
    status?: number;
    statusCode?: number;
    code?: string;
    message?: string;
    name?: string;
  };
  const status = anyErr.status ?? anyErr.statusCode;
  if (status === 429 || (typeof status === 'number' && status >= 500)) {
    return true;
  }
  if (
    anyErr.code === 'ETIMEDOUT' ||
    anyErr.code === 'ECONNRESET' ||
    anyErr.name === 'AbortError' ||
    anyErr.name === 'TimeoutError'
  ) {
    return true;
  }
  const msg = (anyErr.message ?? '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('overloaded') ||
    msg.includes('503') ||
    msg.includes('502') ||
    msg.includes('529')
  );
}

export function sanitizeLessonErrorMessage(err: unknown): string {
  if (err instanceof AppError) {
    if (err.code === 'AI_UNAVAILABLE') {
      return 'AI lesson generator is temporarily unavailable. Please try again shortly.';
    }
    return err.message.slice(0, 480);
  }
  const msg = err instanceof Error ? err.message : String(err ?? '');
  const lower = msg.toLowerCase();
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('quota')) {
    return 'AI service is busy right now. Please wait a moment and try again.';
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('abort')) {
    return 'Lesson preparation took too long. Please try again.';
  }
  if (lower.includes('json') || lower.includes('schema')) {
    return 'Could not format this lesson properly. Please try again.';
  }
  return 'Could not prepare this lesson right now. Please try again.';
}

async function callLlmWithRetry(
  llm: LLMProvider,
  prompt: string,
  opts: GenerateTextOptions,
  retryBaseDelayMs = 600,
) {
  const maxAttempts = 3;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const signal =
        opts.signal ??
        (typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(45_000) : undefined);
      return await llm.generateText(prompt, { ...opts, signal });
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts && isTransientProviderError(err)) {
        const delayMs = retryBaseDelayMs * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function verifyLessonMathExamples(
  content: TopicLessonContent,
): Promise<string | null> {
  const { evaluate } = await import('mathjs');
  for (const ex of content.workedExamples) {
    if (
      ex.verificationExpr &&
      typeof ex.expectedNumeric === 'number' &&
      Number.isFinite(ex.expectedNumeric)
    ) {
      try {
        const computed = Number(evaluate(ex.verificationExpr));
        if (Number.isFinite(computed) && Math.abs(computed - ex.expectedNumeric) > 1e-3) {
          return `Example "${ex.title}" failed math verification: ${ex.verificationExpr} = ${computed}, expected ${ex.expectedNumeric}`;
        }
      } catch {
        // Non-numeric or symbolic expression skipped
      }
    }
  }
  return null;
}

export async function runLessonGenerationPipeline(deps: {
  prisma: PrismaClient;
  llm: LLMProvider;
  logger: Logger;
  userId: string;
  topic: TopicInput;
  retryBaseDelayMs?: number;
}): Promise<{ content: TopicLessonContent; status: LessonStatus; mathWarning: string | null }> {
  const { prisma, llm, logger, userId, topic, retryBaseDelayMs } = deps;
  if (!llm.isConfigured()) {
    throw new AppError('AI_UNAVAILABLE', 'Lesson generator is temporarily unavailable.');
  }

  const buildPrompt = (retryReason?: string) =>
    [
      `Write an original, readable Ghanaian SHS study lesson for the topic below.`,
      `Subject: ${topic.subject.name}`,
      `Topic: ${topic.title}`,
      `SHS Year: ${topic.schoolYear ?? 'SHS 1–3'}`,
      `Syllabus Strand: ${topic.strand ?? 'Core Syllabus'}${topic.subStrand ? ` / ${topic.subStrand}` : ''}`,
      `Syllabus Version: ${topic.subject.syllabusVersion}`,
      topic.referenceNotes ? `Admin Reference Notes (MUST FOLLOW):\n${topic.referenceNotes}` : '',
      retryReason ? `PREVIOUS OUTPUT ERROR (FIX THIS): ${retryReason}` : '',
      `Rules:`,
      `- Use clear, simple English suitable for Ghanaian SHS students, with relatable Ghanaian examples where natural.`,
      `- Write 100% ORIGINAL explanations in your own words. Do NOT copy textbooks or WAEC past papers, and never claim the content is official WAEC or GES material.`,
      `- For maths/science equations use LaTeX ($...$ inline, $$...$$ display). For numeric worked examples, include "verificationExpr" (a valid mathjs arithmetic expression) and "expectedNumeric" so we can verify the arithmetic.`,
      `- Include 3–5 objectives, 2–5 short sections (with keyTerms, optional formulaOrRule, optional localExample), 1–3 workedExamples, commonMistakes, rememberThis, and 5 checkYourself questions.`,
      `- If the topic cannot be reliably explained at SHS level, set "outsideSyllabus": true and explain honestly.`,
      `- Return ONLY valid JSON matching the schema with no markdown code fences.`,
      `JSON shape: {"title":"...","subjectName":"...","schoolYear":"...","strand":"...","subStrand":"...","estimatedMinutes":8,"objectives":["..."],"introduction":"...","sections":[{"id":"sec-1","heading":"...","body":"...","keyTerms":[{"term":"...","definition":"..."}],"formulaOrRule":null,"localExample":null}],"workedExamples":[{"id":"ex-1","title":"...","problem":"...","steps":["..."],"finalAnswer":"...","verificationExpr":null,"expectedNumeric":null}],"commonMistakes":["..."],"rememberThis":["..."],"checkYourself":[{"id":"q1","question":"...","options":["A","B","C","D"],"answer":"...","explanation":"..."}],"outsideSyllabus":false}`,
    ]
      .filter(Boolean)
      .join('\n\n');

  let validated: TopicLessonContent | null = null;
  let needsReview = false;
  let mathWarning: string | null = null;
  let lastReason = '';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = Date.now();
    const res = await callLlmWithRetry(
      llm,
      buildPrompt(lastReason || undefined),
      {
        systemPrompt: 'You are a Ghanaian SHS curriculum writer. Output strict valid JSON only.',
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
      },
      retryBaseDelayMs,
    );

    void recordUsageEvent(prisma, {
      userId,
      feature: 'shs_ai',
      model: llm.modelName,
      tokensIn: res.usage?.inputTokens ?? 0,
      tokensOut: res.usage?.outputTokens ?? 0,
      durationMs: Date.now() - startedAt,
      status: 'success',
      route: '/api/v1/shs/lessons/:topicId',
    });

    let rawJson: unknown;
    try {
      rawJson = extractJsonObject(res.text);
    } catch {
      lastReason = 'Output was not valid JSON or was truncated.';
      continue;
    }

    const parsed = topicLessonContentSchema.safeParse(rawJson);
    if (!parsed.success) {
      lastReason = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      continue;
    }

    const safety = screenShsChatContent(JSON.stringify(parsed.data));
    if (safety.flagged) {
      lastReason = 'Generated content triggered SHS safety filter.';
      continue;
    }

    const mathErr = await verifyLessonMathExamples(parsed.data);
    if (mathErr) {
      if (attempt === 1) {
        lastReason = mathErr;
        continue;
      }
      needsReview = true;
      mathWarning = mathErr;
      logger.warn(
        { topicId: topic.id, mathWarning },
        'SHS lesson saved with needs_review after math verification mismatch',
      );
    }

    validated = {
      ...parsed.data,
      disclaimer: LESSON_DISCLAIMER,
    };
    break;
  }

  if (!validated) {
    logger.warn({ topicId: topic.id, lastReason }, 'SHS lesson generation failed validation');
    throw new AppError(
      'AI_BAD_OUTPUT',
      lastReason || 'Could not prepare a verified lesson right now. Please try again.',
    );
  }

  return {
    content: validated,
    status: needsReview ? 'needs_review' : 'draft',
    mathWarning,
  };
}

/**
 * Acquires a DB-backed lock on TopicLesson and runs generation asynchronously in the background.
 * Returns the current TopicLesson row immediately so the HTTP request never blocks on the LLM.
 */
export async function enqueueTopicLessonJob(deps: {
  prisma: PrismaClient;
  llm: LLMProvider;
  logger: Logger;
  userId: string;
  topic: TopicInput;
  forceRegenerate?: boolean;
  retryFailed?: boolean;
  retryBaseDelayMs?: number;
}) {
  const {
    prisma,
    llm,
    logger,
    userId,
    topic,
    forceRegenerate = false,
    retryFailed = false,
    retryBaseDelayMs,
  } = deps;

  const now = new Date();
  const existing = await prisma.topicLesson.findUnique({ where: { topicId: topic.id } });

  if (existing && !forceRegenerate) {
    if (existing.jobStatus === 'ready') {
      return existing;
    }
    const lockActive =
      (existing.jobStatus === 'queued' || existing.jobStatus === 'generating') &&
      existing.generationLockedUntil !== null &&
      existing.generationLockedUntil > now;
    if (lockActive) {
      return existing;
    }
    if (existing.jobStatus === 'failed' && !retryFailed) {
      return existing;
    }
  }

  if (!llm.isConfigured()) {
    throw new AppError('AI_UNAVAILABLE', 'Lesson generator is temporarily unavailable.');
  }

  const lockedUntil = new Date(now.getTime() + LESSON_LOCK_TTL_MS);
  let claimedRow = existing;
  let acquired = false;

  if (!existing) {
    try {
      claimedRow = await prisma.topicLesson.create({
        data: {
          topicId: topic.id,
          contentJson: {},
          status: 'draft',
          jobStatus: 'queued',
          generationError: null,
          generationStartedAt: now,
          generationLockedUntil: lockedUntil,
          model: llm.modelName,
          promptVersion: LESSON_PROMPT_VERSION,
        },
      });
      acquired = true;
    } catch {
      claimedRow = await prisma.topicLesson.findUnique({ where: { topicId: topic.id } });
    }
  } else {
    const whereGuard = forceRegenerate
      ? { id: existing.id }
      : {
          id: existing.id,
          OR: [
            { jobStatus: 'failed' as const },
            { generationLockedUntil: null },
            { generationLockedUntil: { lt: now } },
          ],
        };
    const updated = await prisma.topicLesson.updateMany({
      where: whereGuard,
      data: {
        jobStatus: 'queued',
        generationError: null,
        generationStartedAt: now,
        generationLockedUntil: lockedUntil,
      },
    });
    acquired = updated.count > 0;
    claimedRow = await prisma.topicLesson.findUnique({ where: { topicId: topic.id } });
  }

  if (acquired && !inflightJobs.has(topic.id)) {
    const hasPriorContent = Boolean(
      existing &&
      existing.contentJson &&
      typeof existing.contentJson === 'object' &&
      'title' in (existing.contentJson as Record<string, unknown>),
    );

    const jobPromise = (async () => {
      try {
        await prisma.topicLesson.update({
          where: { topicId: topic.id },
          data: { jobStatus: 'generating' },
        });

        const result = await runLessonGenerationPipeline({
          prisma,
          llm,
          logger,
          userId,
          topic,
          retryBaseDelayMs,
        });

        await prisma.topicLesson.update({
          where: { topicId: topic.id },
          data: {
            contentJson: result.content as unknown as Prisma.InputJsonValue,
            status: result.status,
            jobStatus: 'ready',
            generationError: null,
            generationLockedUntil: null,
            generatedAt: new Date(),
            model: llm.modelName,
            promptVersion: LESSON_PROMPT_VERSION,
            ...(hasPriorContent ? { version: { increment: 1 } } : {}),
          },
        });
      } catch (err) {
        const safeMessage = sanitizeLessonErrorMessage(err);
        logger.warn({ topicId: topic.id, err, safeMessage }, 'Background SHS lesson job failed');
        void recordUsageEvent(prisma, {
          userId,
          feature: 'shs_ai',
          model: llm.modelName,
          tokensIn: 0,
          tokensOut: 0,
          durationMs: Date.now() - now.getTime(),
          status: 'error',
          route: '/api/v1/shs/lessons/:topicId',
        });
        await prisma.topicLesson
          .update({
            where: { topicId: topic.id },
            data: {
              jobStatus: 'failed',
              generationError: safeMessage,
              generationLockedUntil: null,
            },
          })
          .catch(() => undefined);
      } finally {
        inflightJobs.delete(topic.id);
      }
    })();

    inflightJobs.set(topic.id, jobPromise);
  }

  return claimedRow!;
}

/**
 * Synchronous wrapper used by admin tools/tests that need the completed lesson row.
 */
export async function generateTopicLessonContent(deps: {
  prisma: PrismaClient;
  llm: LLMProvider;
  logger: Logger;
  userId: string;
  topic: TopicInput;
  forceRegenerate?: boolean;
  retryBaseDelayMs?: number;
}) {
  const { prisma, topic, forceRegenerate = false } = deps;
  if (!forceRegenerate) {
    const existing = await prisma.topicLesson.findUnique({ where: { topicId: topic.id } });
    if (existing && existing.jobStatus === 'ready') {
      return existing;
    }
  }

  await enqueueTopicLessonJob({ ...deps, retryFailed: true });
  const pending = inflightJobs.get(topic.id);
  if (pending) {
    await pending;
  }

  const finalRow = await prisma.topicLesson.findUnique({ where: { topicId: topic.id } });
  if (!finalRow || finalRow.jobStatus !== 'ready') {
    throw new AppError(
      'AI_BAD_OUTPUT',
      finalRow?.generationError ??
        'Could not prepare a verified lesson right now. Please try again.',
    );
  }
  return finalRow;
}
