import type { Prisma, PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { z } from 'zod';
import { AppError } from '../../lib/errors';
import type { LLMProvider } from '../../lib/llm/provider';
import { recordUsageEvent } from '../admin/admin.logging';
import { screenShsChatContent } from './shs.safety';

export const LESSON_PROMPT_VERSION = 'shs-lesson-v1';
export const LESSON_DISCLAIMER = 'AI-prepared study notes. Check with your teacher and textbook.';

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

/** In-process lock so two simultaneous first-opens never trigger two AI generations. */
const inflightGenerations = new Map<string, Promise<TopicLessonContent>>();

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

export async function generateTopicLessonContent(deps: {
  prisma: PrismaClient;
  llm: LLMProvider;
  logger: Logger;
  userId: string;
  topic: {
    id: string;
    title: string;
    strand: string | null;
    subStrand: string | null;
    referenceNotes: string | null;
    schoolYear: string | null;
    subject: { name: string; syllabusVersion: string };
  };
  forceRegenerate?: boolean;
}) {
  const { prisma, llm, logger, userId, topic, forceRegenerate = false } = deps;

  if (!forceRegenerate) {
    const existing = await prisma.topicLesson.findUnique({ where: { topicId: topic.id } });
    if (existing) {
      return existing;
    }
  }

  let promise = inflightGenerations.get(topic.id);
  if (!promise) {
    promise = (async () => {
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
          topic.referenceNotes
            ? `Admin Reference Notes (MUST FOLLOW):\n${topic.referenceNotes}`
            : '',
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
      let lastReason = '';

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const startedAt = Date.now();
        const res = await llm.generateText(buildPrompt(lastReason || undefined), {
          systemPrompt: 'You are a Ghanaian SHS curriculum writer. Output strict valid JSON only.',
          maxOutputTokens: 3600,
        });

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

        const cleaned = res.text
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/i, '');

        let rawJson: unknown;
        try {
          rawJson = JSON.parse(cleaned);
        } catch {
          lastReason = 'Output was not valid JSON.';
          continue;
        }

        const parsed = topicLessonContentSchema.safeParse(rawJson);
        if (!parsed.success) {
          lastReason = parsed.error.issues
            .map((i) => `${i.path.join('.')}: ${i.message}`)
            .join('; ');
          continue;
        }

        const mathErr = await verifyLessonMathExamples(parsed.data);
        if (mathErr) {
          lastReason = mathErr;
          continue;
        }

        const safety = screenShsChatContent(JSON.stringify(parsed.data));
        if (safety.flagged) {
          lastReason = 'Generated content triggered SHS safety filter.';
          continue;
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
          'Could not prepare a verified lesson right now. Please try again.',
        );
      }

      return validated;
    })();

    inflightGenerations.set(topic.id, promise);
  }

  let content: TopicLessonContent;
  try {
    content = await promise;
  } finally {
    inflightGenerations.delete(topic.id);
  }

  const existing = await prisma.topicLesson.findUnique({ where: { topicId: topic.id } });
  if (existing && !forceRegenerate) {
    return existing;
  }

  return prisma.topicLesson.upsert({
    where: { topicId: topic.id },
    create: {
      topicId: topic.id,
      contentJson: content as unknown as Prisma.InputJsonValue,
      status: 'draft',
      version: 1,
      languageLevel: 'shs',
      model: llm.modelName,
      promptVersion: LESSON_PROMPT_VERSION,
    },
    update: {
      contentJson: content as unknown as Prisma.InputJsonValue,
      status: 'draft',
      version: { increment: 1 },
      generatedAt: new Date(),
      model: llm.modelName,
      promptVersion: LESSON_PROMPT_VERSION,
    },
  });
}
