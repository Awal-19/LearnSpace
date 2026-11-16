import type { DocumentJob, DocumentJobKind, Prisma, PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { AppError } from '../../lib/errors';
import type { LLMProvider } from '../../lib/llm/provider';
import type { StorageService } from '../../lib/storage';
import { detectAttachmentType } from '../ai/attachments.service';
import { extractDocumentPages } from './documents.extract';
import { generateJsonWithRetry } from './documents.llmJson';
import {
  buildGenerateQuestionsSystemPrompt,
  DETECT_QUESTIONS_SYSTEM_PROMPT,
} from './documents.prompts';
import {
  chunkDocumentPages,
  detectedQuestionsJsonSchema,
  generatedSetJsonSchema,
  generateQuestionsSchema,
  type DocumentPage,
} from './documents.schemas';

const MAX_ATTEMPTS = 2;

export type DocumentJobHandler = (
  job: DocumentJob,
  updateProgress: (progress: number) => Promise<void>,
) => Promise<void>;

export interface DocumentJobQueue {
  enqueue(params: {
    documentId: string;
    userId: string;
    kind: DocumentJobKind;
    payload?: Prisma.InputJsonValue;
  }): Promise<DocumentJob>;
  registerHandler(kind: DocumentJobKind, handler: DocumentJobHandler): void;
  processNext(): Promise<boolean>;
  processById(jobId: string): Promise<void>;
  startWorker(intervalMs?: number): void;
  stopWorker(): void;
}

export function createDocumentJobQueue(deps: {
  prisma: PrismaClient;
  storage: StorageService;
  llm?: LLMProvider;
  logger: Logger;
}): DocumentJobQueue {
  const { prisma, storage, llm, logger } = deps;
  const handlers = new Map<DocumentJobKind, DocumentJobHandler>();
  let timer: NodeJS.Timeout | null = null;
  let polling = false;

  const updateProgress = async (jobId: string, progress: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(progress)));
    await prisma.documentJob.update({
      where: { id: jobId },
      data: { progress: clamped },
    });
  };

  // Default handler for `extract` jobs
  handlers.set('extract', async (job, setProgress) => {
    const doc = await prisma.document.findUnique({ where: { id: job.documentId } });
    if (!doc) return;

    await prisma.document.update({
      where: { id: doc.id },
      data: { status: 'extracting', errorMessage: null },
    });
    await setProgress(20);

    try {
      const buffer = await storage.readAttachmentBytes(doc.storageKey, doc.storageUrl, doc.kind);
      await setProgress(45);

      const detected = detectAttachmentType(buffer, doc.mimeType, doc.originalName) ?? {
        mimeType: doc.mimeType,
        kind: doc.kind,
        extension: doc.originalName.split('.').pop()?.toLowerCase() ?? 'bin',
      };

      const extracted = await extractDocumentPages(buffer, detected, logger, llm);
      await setProgress(85);

      await prisma.document.update({
        where: { id: doc.id },
        data: {
          extractedText: extracted.extractedText,
          pagesJson: extracted.pages as unknown as Prisma.InputJsonValue,
          pageCount: extracted.pageCount,
          truncated: extracted.truncated,
          status: 'ready',
          errorMessage: null,
        },
      });
      await setProgress(100);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Document extraction failed';
      await prisma.document.update({
        where: { id: doc.id },
        data: { status: 'failed', errorMessage: message },
      });
      throw err;
    }
  });

  // Handler for Mode 1: detect_questions
  handlers.set('detect_questions', async (job, setProgress) => {
    if (!llm || !llm.isConfigured()) {
      throw new AppError('AI_UNAVAILABLE', 'AI provider is not configured');
    }
    const doc = await prisma.document.findUnique({ where: { id: job.documentId } });
    if (!doc) return;

    const rawPages = Array.isArray(doc.pagesJson)
      ? (doc.pagesJson as unknown as DocumentPage[])
      : [];
    const pages: DocumentPage[] =
      rawPages.length > 0
        ? rawPages
        : [{ index: 1, label: 'Page 1', text: doc.extractedText, hasImages: doc.kind === 'image' }];

    const chunks = chunkDocumentPages(pages, 10_000);
    if (chunks.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'No readable text found in document');
    }

    await setProgress(10);
    const detectedAll: Array<{
      section: string | null;
      questionNumber: string;
      prompt: string;
      marks: number | null;
      instructions: string | null;
      unclear: boolean;
      unclearReason: string | null;
    }> = [];
    const seenKeys = new Set<string>();

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const prompt = `Document title: ${doc.title}\nPages/Sections: ${chunk.pageRange}\n\n${chunk.text}`;
      const { data } = await generateJsonWithRetry(
        llm,
        prompt,
        DETECT_QUESTIONS_SYSTEM_PROMPT,
        detectedQuestionsJsonSchema,
      );

      for (const q of data.questions) {
        const key = `${q.questionNumber.toLowerCase()}::${q.prompt.slice(0, 80).toLowerCase()}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        detectedAll.push({
          section: q.section ?? null,
          questionNumber: q.questionNumber,
          prompt: q.prompt,
          marks: q.marks ?? null,
          instructions: q.instructions ?? null,
          unclear: Boolean(q.unclear),
          unclearReason: q.unclearReason ?? null,
        });
      }

      const pct = 10 + Math.round(((i + 1) / chunks.length) * 80);
      await setProgress(pct);
    }

    await prisma.$transaction(async (tx) => {
      await tx.extractedQuestion.deleteMany({
        where: { documentId: doc.id, userId: doc.userId },
      });
      if (detectedAll.length > 0) {
        await tx.extractedQuestion.createMany({
          data: detectedAll.map((q, idx) => ({
            documentId: doc.id,
            userId: doc.userId,
            position: idx + 1,
            section: q.section,
            questionNumber: q.questionNumber,
            prompt: q.prompt,
            marks: q.marks,
            instructions: q.instructions,
            unclear: q.unclear,
            unclearReason: q.unclearReason,
            selected: true,
          })),
        });
      }
    });
    await setProgress(100);
  });

  // Handler for Mode 2: generate_set
  handlers.set('generate_set', async (job, setProgress) => {
    if (!llm || !llm.isConfigured()) {
      throw new AppError('AI_UNAVAILABLE', 'AI provider is not configured');
    }
    const doc = await prisma.document.findUnique({ where: { id: job.documentId } });
    if (!doc) return;

    const settings = generateQuestionsSchema.parse(job.payload);
    const rawPages = Array.isArray(doc.pagesJson)
      ? (doc.pagesJson as unknown as DocumentPage[])
      : [];
    let pages: DocumentPage[] =
      rawPages.length > 0
        ? rawPages
        : [{ index: 1, label: 'Page 1', text: doc.extractedText, hasImages: doc.kind === 'image' }];

    if (settings.scope === 'pages' && settings.selectedPages?.length) {
      const allowed = new Set(settings.selectedPages);
      const filtered = pages.filter((p) => allowed.has(p.index));
      if (filtered.length > 0) pages = filtered;
    } else if (settings.scope === 'topic' && settings.topic) {
      const needle = settings.topic.toLowerCase();
      const matching = pages.filter((p) => p.text.toLowerCase().includes(needle));
      if (matching.length > 0) pages = matching;
    }

    const chunks = chunkDocumentPages(pages, 10_000);
    if (chunks.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'No readable content found for the selected scope');
    }

    await setProgress(10);
    const systemPrompt = buildGenerateQuestionsSystemPrompt({
      types: settings.types,
      difficulty: settings.difficulty,
      style: settings.style,
      topic: settings.topic,
    });

    const collected: Array<{
      type: 'mcq' | 'true_false' | 'short_answer' | 'essay' | 'fill_blank' | 'calculation' | 'flashcard';
      difficulty: 'easy' | 'medium' | 'hard';
      topic: string;
      prompt: string;
      options: string[] | null;
      correctAnswer: string;
      explanation: string;
      sourceRef: string;
    }> = [];
    const seenPrompts = new Set<string>();

    for (let i = 0; i < chunks.length; i++) {
      const remaining = settings.count - collected.length;
      if (remaining <= 0) break;

      const chunksLeft = chunks.length - i;
      const targetForChunk = Math.max(1, Math.ceil(remaining / chunksLeft));
      const chunk = chunks[i]!;

      const prompt = [
        `Document: ${doc.title}`,
        `Pages/Slides in this chunk: ${chunk.pageRange}`,
        `Generate exactly ${targetForChunk} high-quality non-duplicate question(s) from the material below.`,
        '',
        chunk.text,
      ].join('\n');

      const { data } = await generateJsonWithRetry(
        llm,
        prompt,
        systemPrompt,
        generatedSetJsonSchema,
        4000,
      );

      for (const q of data.questions) {
        if (collected.length >= settings.count) break;
        const key = q.prompt.trim().toLowerCase().slice(0, 120);
        if (seenPrompts.has(key)) continue;
        seenPrompts.add(key);
        collected.push({
          type: q.type,
          difficulty: q.difficulty,
          topic: q.topic,
          prompt: q.prompt,
          options: q.options ?? null,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          sourceRef: q.sourceRef,
        });
      }

      const pct = 10 + Math.round(((i + 1) / chunks.length) * 80);
      await setProgress(pct);
    }

    const setTitle = (
      settings.title?.trim() ||
      `${doc.title} — ${settings.style === 'exam' ? 'Exam Practice' : 'Quick Revision'}`
    ).slice(0, 200);

    const createdSet = await prisma.generatedQuestionSet.create({
      data: {
        documentId: doc.id,
        userId: doc.userId,
        title: setTitle,
        settingsJson: settings as unknown as Prisma.InputJsonValue,
        questions: {
          create: collected.map((q, idx) => ({
            position: idx + 1,
            type: q.type,
            difficulty: q.difficulty,
            topic: q.topic,
            prompt: q.prompt,
            optionsJson: q.options ? (q.options as unknown as Prisma.InputJsonValue) : undefined,
            correctAnswer: q.correctAnswer,
            explanation: q.explanation,
            sourceRef: q.sourceRef,
          })),
        },
      },
    });

    await prisma.documentJob.update({
      where: { id: job.id },
      data: {
        payload: { ...settings, setId: createdSet.id } as unknown as Prisma.InputJsonValue,
      },
    });

    await setProgress(100);
  });

  const executeJob = async (job: DocumentJob): Promise<void> => {
    const handler = handlers.get(job.kind);
    if (!handler) {
      await prisma.documentJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: `No handler registered for job kind "${job.kind}"`,
          finishedAt: new Date(),
        },
      });
      return;
    }

    try {
      await handler(job, (p) => updateProgress(job.id, p));
      await prisma.documentJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          progress: 100,
          finishedAt: new Date(),
          error: null,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Job failed';
      const nextAttempt = job.attempts + 1;
      if (nextAttempt < MAX_ATTEMPTS) {
        await prisma.documentJob.update({
          where: { id: job.id },
          data: {
            status: 'queued',
            attempts: nextAttempt,
            error: message,
            runAt: new Date(Date.now() + 2_000),
          },
        });
      } else {
        await prisma.documentJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            attempts: nextAttempt,
            error: message,
            finishedAt: new Date(),
          },
        });
      }
      logger.warn({ err, jobId: job.id, kind: job.kind }, 'Document job execution failed');
    }
  };

  const claimNext = async (): Promise<DocumentJob | null> => {
    const rows = await prisma.$queryRaw<DocumentJob[]>`
      UPDATE "document_jobs"
      SET "status" = 'running', "startedAt" = NOW()
      WHERE "id" = (
        SELECT "id" FROM "document_jobs"
        WHERE "status" = 'queued' AND "runAt" <= NOW()
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;
    return rows[0] ?? null;
  };

  return {
    async enqueue({ documentId, userId, kind, payload = {} }) {
      const job = await prisma.documentJob.create({
        data: {
          documentId,
          userId,
          kind,
          status: 'queued',
          progress: 0,
          payload,
        },
      });
      // Kick off asynchronously in the background without blocking the HTTP response.
      setImmediate(() => {
        void this.processNext().catch((err) => {
          logger.warn({ err }, 'Background document job tick failed');
        });
      });
      return job;
    },

    registerHandler(kind, handler) {
      handlers.set(kind, handler);
    },

    async processNext() {
      const job = await claimNext();
      if (!job) return false;
      await executeJob(job);
      return true;
    },

    async processById(jobId) {
      const claimed = await prisma.$queryRaw<DocumentJob[]>`
        UPDATE "document_jobs"
        SET "status" = 'running', "startedAt" = NOW()
        WHERE "id" = ${jobId}::uuid AND "status" = 'queued'
        RETURNING *
      `;
      const job = claimed[0];
      if (job) {
        await executeJob(job);
      }
    },

    startWorker(intervalMs = 2_000) {
      if (timer) return;
      timer = setInterval(() => {
        if (polling) return;
        polling = true;
        void this.processNext()
          .catch((err) => logger.warn({ err }, 'Document worker poll error'))
          .finally(() => {
            polling = false;
          });
      }, intervalMs);
      timer.unref();
    },

    stopWorker() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}

