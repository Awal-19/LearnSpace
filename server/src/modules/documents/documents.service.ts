import type {
  AnswerMode,
  Document,
  DocumentJob,
  DocumentPracticeAttempt,
  DocumentType,
  ExtractedQuestion,
  GeneratedQuestion,
  GeneratedQuestionSet,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import type { Logger } from 'pino';
import sharp from 'sharp';
import { AppError } from '../../lib/errors';
import type { LLMContentPart, LLMProvider } from '../../lib/llm/provider';
import type { StorageService } from '../../lib/storage';
import {
  detectAttachmentType,
  MAX_DOC_BYTES,
  MAX_IMAGE_BYTES,
  noopMalwareScanner,
  sanitizeFilename,
  type MalwareScanner,
} from '../ai/attachments.service';
import { buildDocxBuffer, buildPdfBuffer } from './documents.export';
import type { DocumentJobQueue } from './documents.jobs';
import { generateJsonWithRetry } from './documents.llmJson';
import {
  buildGenerateQuestionsSystemPrompt,
  buildPastQuestionSystemPrompt,
  GRADE_OPEN_ANSWERS_SYSTEM_PROMPT,
  splitThinkingAndAnswer,
} from './documents.prompts';
import {
  generatedQuestionItemSchema,
  generatedSetJsonSchema,
  gradeOpenAnswersJsonSchema,
  type DocumentPage,
  type generateQuestionsSchema,
} from './documents.schemas';
import type { z } from 'zod';

export const DAILY_DOCUMENT_QUOTA = 30;

export interface PublicDocument {
  id: string;
  title: string;
  type: DocumentType;
  courseId: string | null;
  originalName: string;
  mimeType: string;
  kind: 'image' | 'document';
  sizeBytes: number;
  pageCount: number;
  truncated: boolean;
  status: Document['status'];
  errorMessage: string | null;
  contentUrl: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PublicDocumentRow = Pick<
  Document,
  | 'id'
  | 'title'
  | 'type'
  | 'courseId'
  | 'originalName'
  | 'mimeType'
  | 'kind'
  | 'sizeBytes'
  | 'pageCount'
  | 'truncated'
  | 'status'
  | 'errorMessage'
  | 'createdAt'
  | 'updatedAt'
>;

export function toPublicDocument(doc: PublicDocumentRow): PublicDocument {
  return {
    id: doc.id,
    title: doc.title,
    type: doc.type,
    courseId: doc.courseId,
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    kind: doc.kind,
    sizeBytes: doc.sizeBytes,
    pageCount: doc.pageCount,
    truncated: doc.truncated,
    status: doc.status,
    errorMessage: doc.errorMessage,
    contentUrl: `/api/v1/documents/${doc.id}/content`,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export interface DocumentsService {
  upload(params: {
    userId: string;
    type: DocumentType;
    title?: string;
    courseId?: string | null;
    filename: string;
    declaredMime: string;
    buffer: Buffer;
  }): Promise<{ document: PublicDocument; job: DocumentJob }>;

  list(
    userId: string,
    filters: { type?: DocumentType; courseId?: string; q?: string; page?: number; pageSize?: number },
  ): Promise<{ documents: PublicDocument[]; total: number; page: number; pageSize: number }>;

  getDetail(
    userId: string,
    documentId: string,
  ): Promise<{
    document: PublicDocument & { extractedText: string; pagesJson: Prisma.JsonValue };
    latestJob: DocumentJob | null;
    extractedQuestions: ExtractedQuestion[];
    questionSets: GeneratedQuestionSet[];
  }>;

  getOwnedDocument(userId: string, documentId: string): Promise<Document>;

  getContent(
    userId: string,
    documentId: string,
  ): Promise<{ redirectUrl: string | null; bytes?: Buffer; mimeType: string; filename: string }>;

  remove(userId: string, documentId: string): Promise<void>;

  enqueueDetectQuestions(userId: string, documentId: string): Promise<DocumentJob>;

  patchQuestions(
    userId: string,
    documentId: string,
    questions: Array<{
      id?: string;
      section?: string | null;
      questionNumber: string;
      prompt: string;
      marks?: number | null;
      instructions?: string | null;
      unclear?: boolean;
      unclearReason?: string | null;
      selected?: boolean;
    }>,
  ): Promise<ExtractedQuestion[]>;

  streamQuestionAnswer(params: {
    userId: string;
    documentId: string;
    questionId: string;
    mode: AnswerMode;
    useCourseNotes: boolean;
    refinement?: 'regenerate' | 'simpler' | 'another_method';
    signal?: AbortSignal;
    onMeta: (meta: { questionId: string; citedSources: string[] }) => void;
    onDelta: (text: string) => void;
  }): Promise<ExtractedQuestion>;

  exportAnswers(
    userId: string,
    documentId: string,
    format: 'pdf' | 'docx',
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }>;

  saveAnswersToNotes(
    userId: string,
    documentId: string,
    opts: { title?: string; courseId?: string | null },
  ): Promise<{ noteId: string; title: string }>;

  enqueueGenerateQuestions(
    userId: string,
    documentId: string,
    settings: z.infer<typeof generateQuestionsSchema>,
  ): Promise<DocumentJob>;

  refineGeneratedQuestion(
    userId: string,
    setId: string,
    questionId: string,
    action: 'regenerate' | 'harder' | 'easier' | 'more_on_topic',
  ): Promise<{ question: GeneratedQuestion; addedQuestions?: GeneratedQuestion[] }>;

  submitPracticeAttempt(
    userId: string,
    setId: string,
    answers: Record<string, string>,
  ): Promise<DocumentPracticeAttempt>;

  saveSetToLibrary(
    userId: string,
    setId: string,
    opts: { target: 'quiz' | 'deck' | 'both'; title?: string },
  ): Promise<{ quizId: string | null; deckId: string | null }>;

  exportQuestionSet(
    userId: string,
    setId: string,
    format: 'pdf' | 'docx',
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }>;
}

export function createDocumentsService(deps: {
  prisma: PrismaClient;
  storage: StorageService;
  jobs: DocumentJobQueue;
  llm?: LLMProvider;
  dailyTokenLimit?: number | null;
  logger: Logger;
  scanner?: MalwareScanner;
}): DocumentsService {
  const {
    prisma,
    storage,
    jobs,
    llm,
    dailyTokenLimit = 100_000,
    logger,
    scanner = noopMalwareScanner,
  } = deps;

  return {
    async upload({ userId, type, title, courseId, filename, declaredMime, buffer }) {
      if (!storage.isConfigured()) {
        throw new AppError(
          'STORAGE_UNAVAILABLE',
          'Document storage is not configured on the server',
        );
      }

      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const uploadedToday = await prisma.document.count({
        where: { userId, createdAt: { gte: dayStart } },
      });
      if (uploadedToday >= DAILY_DOCUMENT_QUOTA) {
        throw new AppError(
          'RATE_LIMITED',
          `Daily document upload limit (${DAILY_DOCUMENT_QUOTA}) reached. Try again tomorrow.`,
        );
      }

      if (courseId) {
        const course = await prisma.course.findFirst({
          where: { id: courseId, userId },
          select: { id: true },
        });
        if (!course) {
          throw new AppError('NOT_FOUND', 'Course not found');
        }
      }

      const detected = detectAttachmentType(buffer, declaredMime, filename);
      if (!detected) {
        throw new AppError(
          'UNSUPPORTED_MEDIA_TYPE',
          'Unsupported or invalid file content. Allowed: PDF, DOCX, PPTX, TXT, CSV, JPG, PNG, WEBP, HEIC.',
        );
      }

      const limit = detected.kind === 'image' ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
      if (buffer.length > limit) {
        throw new AppError(
          'PAYLOAD_TOO_LARGE',
          detected.kind === 'image'
            ? 'Images must be 10 MB or smaller.'
            : 'Documents must be 20 MB or smaller.',
        );
      }

      const scanResult = await scanner.scan(buffer, filename);
      if (!scanResult.clean) {
        throw new AppError(
          'VALIDATION_ERROR',
          scanResult.reason ?? 'File rejected by security scanner.',
        );
      }

      let storedBuffer = buffer;
      let storedMime = detected.mimeType;
      let storedExt = detected.extension;

      if (detected.kind === 'image') {
        try {
          const transformed = await sharp(buffer).rotate().jpeg({ quality: 88 }).toBuffer();
          storedBuffer = transformed;
          storedMime = 'image/jpeg';
          storedExt = 'jpg';
        } catch {
          // Keep original buffer if sharp cannot decode (e.g. unsupported HEIC build)
        }
      }

      const safeName = sanitizeFilename(filename);
      const docTitle = (title?.trim() || safeName.replace(/\.[^.]+$/, '') || 'Untitled document').slice(
        0,
        200,
      );

      const uploaded = await storage.uploadAttachment(
        storedBuffer,
        userId,
        detected.kind,
        storedExt,
      );

      const doc = await prisma.document.create({
        data: {
          userId,
          courseId: courseId ?? null,
          title: docTitle,
          type,
          originalName: safeName,
          mimeType: storedMime,
          kind: detected.kind,
          sizeBytes: storedBuffer.length,
          storageKey: uploaded.storageKey,
          storageUrl: uploaded.storageUrl,
          status: 'uploaded',
        },
      });

      const job = await jobs.enqueue({
        documentId: doc.id,
        userId,
        kind: 'extract',
      });

      return { document: toPublicDocument(doc), job };
    },

    async list(userId, { type, courseId, q, page = 1, pageSize = 20 }) {
      const where: Prisma.DocumentWhereInput = { userId };
      if (type) where.type = type;
      if (courseId) where.courseId = courseId;
      if (q) {
        where.OR = [
          { title: { contains: q, mode: 'insensitive' } },
          { originalName: { contains: q, mode: 'insensitive' } },
        ];
      }
      const skip = (page - 1) * pageSize;
      const [docs, total] = await Promise.all([
        prisma.document.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
          select: {
            id: true,
            title: true,
            type: true,
            courseId: true,
            originalName: true,
            mimeType: true,
            kind: true,
            sizeBytes: true,
            pageCount: true,
            truncated: true,
            status: true,
            errorMessage: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.document.count({ where }),
      ]);
      return { documents: docs.map(toPublicDocument), total, page, pageSize };
    },

    async getOwnedDocument(userId, documentId) {
      const doc = await prisma.document.findFirst({
        where: { id: documentId, userId },
      });
      if (!doc) {
        throw new AppError('NOT_FOUND', 'Document not found');
      }
      return doc;
    },

    async getDetail(userId, documentId) {
      const doc = await this.getOwnedDocument(userId, documentId);
      const [latestJob, extractedQuestions, questionSets] = await Promise.all([
        prisma.documentJob.findFirst({
          where: { documentId: doc.id, userId },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.extractedQuestion.findMany({
          where: { documentId: doc.id, userId },
          orderBy: { position: 'asc' },
        }),
        prisma.generatedQuestionSet.findMany({
          where: { documentId: doc.id, userId },
          orderBy: { createdAt: 'desc' },
          include: {
            questions: { orderBy: { position: 'asc' } },
            attempts: { orderBy: { takenAt: 'desc' }, take: 10 },
          },
        }),
      ]);

      return {
        document: {
          ...toPublicDocument(doc),
          extractedText: doc.extractedText,
          pagesJson: doc.pagesJson,
        },
        latestJob,
        extractedQuestions,
        questionSets,
      };
    },

    async getContent(userId, documentId) {
      const doc = await this.getOwnedDocument(userId, documentId);
      const redirectUrl = storage.getSignedAttachmentUrl(doc.storageKey, doc.kind);
      if (redirectUrl) {
        return {
          redirectUrl,
          mimeType: doc.mimeType,
          filename: doc.originalName,
        };
      }
      const bytes = await storage.readAttachmentBytes(doc.storageKey, doc.storageUrl, doc.kind);
      return {
        redirectUrl: null,
        bytes,
        mimeType: doc.mimeType,
        filename: doc.originalName,
      };
    },

    async remove(userId, documentId) {
      const doc = await this.getOwnedDocument(userId, documentId);
      await storage.deleteAttachment(doc.storageKey, doc.kind).catch((err) => {
        logger.warn({ err, documentId }, 'Failed to delete document asset from storage');
      });
      await prisma.document.delete({ where: { id: doc.id } });
    },

    async enqueueDetectQuestions(userId, documentId) {
      const doc = await this.getOwnedDocument(userId, documentId);
      if (doc.status !== 'ready') {
        throw new AppError('VALIDATION_ERROR', 'Document is still processing or failed extraction');
      }
      return jobs.enqueue({
        documentId: doc.id,
        userId,
        kind: 'detect_questions',
      });
    },

    async patchQuestions(userId, documentId, questions) {
      const doc = await this.getOwnedDocument(userId, documentId);
      const existing = await prisma.extractedQuestion.findMany({
        where: { documentId: doc.id, userId },
      });
      const existingById = new Map(existing.map((q) => [q.id, q]));

      return prisma.$transaction(async (tx) => {
        await tx.extractedQuestion.deleteMany({
          where: { documentId: doc.id, userId },
        });
        const created: ExtractedQuestion[] = [];
        for (let i = 0; i < questions.length; i++) {
          const item = questions[i]!;
          const prev = item.id ? existingById.get(item.id) : undefined;
          const promptChanged = prev ? prev.prompt !== item.prompt : false;
          const row = await tx.extractedQuestion.create({
            data: {
              documentId: doc.id,
              userId,
              position: i + 1,
              section: item.section ?? null,
              questionNumber: item.questionNumber,
              prompt: item.prompt,
              marks: item.marks ?? null,
              instructions: item.instructions ?? null,
              unclear: Boolean(item.unclear),
              unclearReason: item.unclearReason ?? null,
              selected: item.selected ?? true,
              answerMode: prev?.answerMode ?? 'full_worked',
              answerMarkdown: promptChanged ? null : (prev?.answerMarkdown ?? null),
              thinkingMarkdown: promptChanged ? null : (prev?.thinkingMarkdown ?? null),
              citedSourcesJson: promptChanged
                ? undefined
                : ((prev?.citedSourcesJson as Prisma.InputJsonValue | null) ?? undefined),
              status: promptChanged ? 'pending' : (prev?.status ?? 'pending'),
            },
          });
          created.push(row);
        }
        return created;
      });
    },

    async streamQuestionAnswer({
      userId,
      documentId,
      questionId,
      mode,
      useCourseNotes,
      refinement,
      signal,
      onMeta,
      onDelta,
    }) {
      if (!llm || !llm.isConfigured()) {
        throw new AppError('AI_UNAVAILABLE', 'AI provider is not configured on the server');
      }
      const doc = await this.getOwnedDocument(userId, documentId);
      const question = await prisma.extractedQuestion.findFirst({
        where: { id: questionId, documentId: doc.id, userId },
      });
      if (!question) {
        throw new AppError('NOT_FOUND', 'Question not found');
      }

      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const usageRow = await prisma.aiUsageDaily.findUnique({
        where: { userId_day: { userId, day: today } },
      });
      const usedTokens = (usageRow?.inputTokens ?? 0) + (usageRow?.outputTokens ?? 0);
      if (dailyTokenLimit !== null && dailyTokenLimit > 0 && usedTokens >= dailyTokenLimit) {
        throw new AppError('AI_BUDGET_EXCEEDED', 'Daily AI token limit reached. Try again tomorrow.');
      }

      let courseContext = '';
      const citedSources: string[] = [];
      if (useCourseNotes && doc.courseId) {
        const courseDocs = await prisma.document.findMany({
          where: {
            userId,
            courseId: doc.courseId,
            type: { in: ['slides', 'notes'] },
            status: 'ready',
            id: { not: doc.id },
          },
          take: 8,
          orderBy: { createdAt: 'desc' },
        });
        const keywords = question.prompt
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length > 3);
        const scoredPages: Array<{ score: number; label: string; text: string }> = [];
        for (const cd of courseDocs) {
          const pages = Array.isArray(cd.pagesJson)
            ? (cd.pagesJson as unknown as DocumentPage[])
            : [];
          for (const p of pages) {
            const lower = p.text.toLowerCase();
            const score = keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
            if (score > 0 || scoredPages.length < 4) {
              scoredPages.push({
                score,
                label: `${cd.title}, ${p.label}`,
                text: p.text.slice(0, 1800),
              });
            }
          }
        }
        scoredPages.sort((a, b) => b.score - a.score);
        const top = scoredPages.slice(0, 6);
        if (top.length > 0) {
          citedSources.push(...top.map((t) => t.label));
          courseContext = top
            .map((t) => `[Source: ${t.label}]\n${t.text}`)
            .join('\n\n');
        }
      }

      await prisma.extractedQuestion.update({
        where: { id: question.id },
        data: { status: 'answering', answerMode: mode },
      });

      onMeta({ questionId: question.id, citedSources });

      const userParts: LLMContentPart[] = [];
      const textLines = [
        `Document: ${doc.title}`,
        question.section ? `Section: ${question.section}` : null,
        `Question ${question.questionNumber}${question.marks ? ` (${question.marks} marks)` : ''}:`,
        question.instructions ? `Instructions: ${question.instructions}` : null,
        question.prompt,
      ].filter(Boolean);

      if (courseContext) {
        textLines.push('', `<course_material>\n${courseContext}\n</course_material>`);
      } else if (useCourseNotes) {
        textLines.push('', '<course_material>No course slides or notes found for this course.</course_material>');
      }

      userParts.push({ type: 'text', text: textLines.join('\n') });

      if (doc.kind === 'image') {
        try {
          const bytes = await storage.readAttachmentBytes(doc.storageKey, doc.storageUrl, 'image');
          userParts.push({
            type: 'image_url',
            image_url: { url: `data:${doc.mimeType};base64,${bytes.toString('base64')}` },
          });
        } catch (err) {
          logger.warn({ err, documentId: doc.id }, 'Could not attach image bytes for question answer');
        }
      }

      let rawAnswer = '';
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        const stream = llm.stream(
          [{ role: 'user', content: userParts }],
          {
            systemPrompt: buildPastQuestionSystemPrompt({
              mode,
              useCourseNotes,
              refinement,
            }),
            signal,
            maxOutputTokens: 3500,
            temperature: 0.25,
          },
        );
        for await (const chunk of stream) {
          if (chunk.type === 'delta') {
            rawAnswer += chunk.text;
            onDelta(chunk.text);
          } else if (chunk.type === 'usage') {
            inputTokens = chunk.inputTokens;
            outputTokens = chunk.outputTokens;
          }
        }

        const { thinkingMarkdown, answerMarkdown } = splitThinkingAndAnswer(rawAnswer);
        const updated = await prisma.extractedQuestion.update({
          where: { id: question.id },
          data: {
            status: 'answered',
            answerMode: mode,
            thinkingMarkdown,
            answerMarkdown,
            citedSourcesJson: citedSources,
          },
        });

        await prisma.aiUsageDaily.upsert({
          where: { userId_day: { userId, day: today } },
          create: { userId, day: today, inputTokens, outputTokens, requests: 1 },
          update: {
            inputTokens: { increment: inputTokens },
            outputTokens: { increment: outputTokens },
            requests: { increment: 1 },
          },
        });

        return updated;
      } catch (err) {
        await prisma.extractedQuestion.update({
          where: { id: question.id },
          data: { status: 'error' },
        });
        throw err;
      }
    },

    async exportAnswers(userId, documentId, format) {
      const doc = await this.getOwnedDocument(userId, documentId);
      const questions = await prisma.extractedQuestion.findMany({
        where: { documentId: doc.id, userId },
        orderBy: { position: 'asc' },
      });
      const answered = questions.filter((q) => q.answerMarkdown);
      if (answered.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'No answered questions to export yet');
      }

      const sections = answered.map((q) => ({
        heading: `${q.section ? `${q.section} — ` : ''}Question ${q.questionNumber}${
          q.marks ? ` (${q.marks} marks)` : ''
        }`,
        meta: q.instructions ?? undefined,
        prompt: q.prompt,
        body: q.answerMarkdown ?? '',
      }));

      const safeBase = sanitizeFilename(doc.title).replace(/\s+/g, '_');
      if (format === 'pdf') {
        const buffer = await buildPdfBuffer({
          title: `${doc.title} — Worked Answers`,
          subtitle: `Generated by LearnSpace AI (${answered.length} questions)`,
          sections,
        });
        return {
          buffer,
          mimeType: 'application/pdf',
          filename: `${safeBase}_answers.pdf`,
        };
      }

      const buffer = await buildDocxBuffer({
        title: `${doc.title} — Worked Answers`,
        subtitle: `Generated by LearnSpace AI (${answered.length} questions)`,
        sections,
      });
      return {
        buffer,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: `${safeBase}_answers.docx`,
      };
    },

    async saveAnswersToNotes(userId, documentId, opts) {
      const doc = await this.getOwnedDocument(userId, documentId);
      const questions = await prisma.extractedQuestion.findMany({
        where: { documentId: doc.id, userId },
        orderBy: { position: 'asc' },
      });
      const answered = questions.filter((q) => q.answerMarkdown);
      if (answered.length === 0) {
        throw new AppError('VALIDATION_ERROR', 'No answered questions to save yet');
      }

      const title = (opts.title?.trim() || `${doc.title} — Solutions`).slice(0, 200);
      const body = answered
        .map((q) => {
          const header = `## ${q.section ? `${q.section} — ` : ''}Question ${q.questionNumber}${
            q.marks ? ` (${q.marks} marks)` : ''
          }`;
          return `${header}\n\n**Question:** ${q.prompt}\n\n${q.answerMarkdown ?? ''}`;
        })
        .join('\n\n---\n\n');

      const note = await prisma.note.create({
        data: {
          userId,
          courseId: opts.courseId !== undefined ? opts.courseId : doc.courseId,
          title,
          body,
        },
      });
      return { noteId: note.id, title: note.title };
    },

    async enqueueGenerateQuestions(userId, documentId, settings) {
      const doc = await this.getOwnedDocument(userId, documentId);
      if (doc.status !== 'ready') {
        throw new AppError('VALIDATION_ERROR', 'Document is still processing or failed extraction');
      }
      return jobs.enqueue({
        documentId: doc.id,
        userId,
        kind: 'generate_set',
        payload: settings as unknown as Prisma.InputJsonValue,
      });
    },

    async refineGeneratedQuestion(userId, setId, questionId, action) {
      if (!llm || !llm.isConfigured()) {
        throw new AppError('AI_UNAVAILABLE', 'AI provider is not configured on the server');
      }
      const set = await prisma.generatedQuestionSet.findFirst({
        where: { id: setId, userId },
        include: { document: true, questions: { orderBy: { position: 'asc' } } },
      });
      if (!set) {
        throw new AppError('NOT_FOUND', 'Question set not found');
      }
      const target = set.questions.find((q) => q.id === questionId);
      if (!target) {
        throw new AppError('NOT_FOUND', 'Question not found');
      }

      const sourcePages = Array.isArray(set.document.pagesJson)
        ? (set.document.pagesJson as unknown as DocumentPage[])
        : [];
      const matchingPages = sourcePages.filter(
        (p) =>
          p.label.toLowerCase() === target.sourceRef.toLowerCase() ||
          p.text.toLowerCase().includes(target.topic.toLowerCase()),
      );
      const contextText = (matchingPages.length > 0 ? matchingPages : sourcePages.slice(0, 4))
        .map((p) => `--- ${p.label} ---\n${p.text}`)
        .join('\n\n')
        .slice(0, 12_000);

      if (action === 'more_on_topic') {
        const systemPrompt = buildGenerateQuestionsSystemPrompt({
          types: [target.type],
          difficulty: 'mixed',
          style: 'exam',
          topic: target.topic,
        });
        const prompt = `Document: ${set.document.title}\nGenerate 2 new, non-duplicate questions strictly from the material below on the topic "${target.topic}".\n\n${contextText}`;
        const { data } = await generateJsonWithRetry(
          llm,
          prompt,
          systemPrompt,
          generatedSetJsonSchema,
        );
        const startPos =
          set.questions.reduce((max, q) => Math.max(max, q.position), 0) + 1;
        const added: GeneratedQuestion[] = [];
        for (let i = 0; i < data.questions.slice(0, 2).length; i++) {
          const item = data.questions[i]!;
          const created = await prisma.generatedQuestion.create({
            data: {
              setId: set.id,
              position: startPos + i,
              type: item.type,
              difficulty: item.difficulty,
              topic: item.topic,
              prompt: item.prompt,
              optionsJson: item.options
                ? (item.options as unknown as Prisma.InputJsonValue)
                : undefined,
              correctAnswer: item.correctAnswer,
              explanation: item.explanation,
              sourceRef: item.sourceRef,
            },
          });
          added.push(created);
        }
        return { question: target, addedQuestions: added };
      }

      const nextDifficulty =
        action === 'harder' ? 'hard' : action === 'easier' ? 'easy' : target.difficulty;
      const systemPrompt = buildGenerateQuestionsSystemPrompt({
        types: [target.type],
        difficulty: nextDifficulty,
        style: 'exam',
        topic: target.topic,
      });
      const prompt = [
        `Rewrite/regenerate 1 ${target.type} question at "${nextDifficulty}" difficulty strictly from the material below.`,
        `Original question: ${target.prompt}`,
        '',
        contextText,
      ].join('\n');

      const { data } = await generateJsonWithRetry(
        llm,
        prompt,
        systemPrompt,
        generatedSetJsonSchema,
      );
      const replacement = generatedQuestionItemSchema.parse(data.questions[0]);
      const updated = await prisma.generatedQuestion.update({
        where: { id: target.id },
        data: {
          difficulty: replacement.difficulty,
          topic: replacement.topic,
          prompt: replacement.prompt,
          optionsJson: replacement.options
            ? (replacement.options as unknown as Prisma.InputJsonValue)
            : undefined,
          correctAnswer: replacement.correctAnswer,
          explanation: replacement.explanation,
          sourceRef: replacement.sourceRef,
        },
      });
      return { question: updated };
    },

    async submitPracticeAttempt(userId, setId, answers) {
      const set = await prisma.generatedQuestionSet.findFirst({
        where: { id: setId, userId },
        include: { questions: { orderBy: { position: 'asc' } } },
      });
      if (!set) {
        throw new AppError('NOT_FOUND', 'Question set not found');
      }

      const feedback: Array<{
        questionId: string;
        correct: boolean;
        feedback: string;
      }> = [];
      const openEnded: GeneratedQuestion[] = [];

      for (const q of set.questions) {
        const userAns = (answers[q.id] ?? '').trim();
        if (q.type === 'mcq' || q.type === 'true_false' || q.type === 'fill_blank' || q.type === 'flashcard') {
          const isCorrect =
            userAns.toLowerCase() === q.correctAnswer.trim().toLowerCase() ||
            (q.type === 'flashcard' && userAns.toLowerCase() === 'knew_it');
          feedback.push({
            questionId: q.id,
            correct: isCorrect,
            feedback: isCorrect
              ? `Correct! ${q.explanation}`
              : `Expected "${q.correctAnswer}". ${q.explanation}`,
          });
        } else {
          openEnded.push(q);
        }
      }

      if (openEnded.length > 0) {
        const gradedById = new Map<string, { correct: boolean; feedback: string }>();
        if (llm && llm.isConfigured()) {
          try {
            const payload = openEnded.map((q) => ({
              questionId: q.id,
              prompt: q.prompt,
              referenceAnswer: q.correctAnswer,
              explanation: q.explanation,
              studentAnswer: (answers[q.id] ?? '').trim() || '(No answer provided)',
            }));
            const { data } = await generateJsonWithRetry(
              llm,
              JSON.stringify(payload, null, 2),
              GRADE_OPEN_ANSWERS_SYSTEM_PROMPT,
              gradeOpenAnswersJsonSchema,
            );
            for (const r of data.results) {
              gradedById.set(r.questionId, { correct: r.correct, feedback: r.feedback });
            }
          } catch (err) {
            logger.warn({ err, setId }, 'AI grading failed; falling back to keyword comparison');
          }
        }

        for (const q of openEnded) {
          const graded = gradedById.get(q.id);
          if (graded) {
            feedback.push({ questionId: q.id, ...graded });
          } else {
            const userAns = (answers[q.id] ?? '').trim().toLowerCase();
            const isCorrect =
              userAns.length >= 4 &&
              q.correctAnswer
                .toLowerCase()
                .split(/\s+/)
                .filter((w) => w.length > 4)
                .some((kw) => userAns.includes(kw));
            feedback.push({
              questionId: q.id,
              correct: isCorrect,
              feedback: `${q.explanation} (Reference answer: ${q.correctAnswer})`,
            });
          }
        }
      }

      const feedbackMap = new Map(feedback.map((f) => [f.questionId, f]));
      let score = 0;
      const weakTopicCounts = new Map<string, number>();

      for (const q of set.questions) {
        const res = feedbackMap.get(q.id);
        if (res?.correct) {
          score += 1;
        } else {
          weakTopicCounts.set(q.topic, (weakTopicCounts.get(q.topic) ?? 0) + 1);
        }
      }

      const weakTopics = Array.from(weakTopicCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([topic]) => topic);

      const attempt = await prisma.documentPracticeAttempt.create({
        data: {
          setId: set.id,
          userId,
          answersJson: answers as unknown as Prisma.InputJsonValue,
          score,
          total: set.questions.length,
          weakTopicsJson: weakTopics as unknown as Prisma.InputJsonValue,
          feedbackJson: feedback as unknown as Prisma.InputJsonValue,
        },
      });

      if (set.quizId) {
        await prisma.quizAttempt
          .create({
            data: {
              quizId: set.quizId,
              userId,
              answers: answers as unknown as Prisma.InputJsonValue,
              score,
              total: set.questions.length,
            },
          })
          .catch((err) => logger.warn({ err }, 'Failed to mirror practice attempt to quiz_attempts'));
      }

      return attempt;
    },

    async saveSetToLibrary(userId, setId, opts) {
      const set = await prisma.generatedQuestionSet.findFirst({
        where: { id: setId, userId },
        include: { questions: { orderBy: { position: 'asc' } } },
      });
      if (!set) {
        throw new AppError('NOT_FOUND', 'Question set not found');
      }

      const baseTitle = (opts.title?.trim() || set.title).slice(0, 150);
      let quizId = set.quizId;
      let deckId = set.deckId;

      if ((opts.target === 'quiz' || opts.target === 'both') && !quizId) {
        const quizQuestions = set.questions.map((q, idx) => {
          const optsList = Array.isArray(q.optionsJson)
            ? (q.optionsJson as unknown as string[])
            : [q.correctAnswer, 'Not covered in slides', 'None of the above'];
          const correctIndex = Math.max(
            0,
            optsList.findIndex(
              (o) => o.trim().toLowerCase() === q.correctAnswer.trim().toLowerCase(),
            ),
          );
          return {
            position: idx + 1,
            prompt: q.prompt,
            options: optsList as unknown as Prisma.InputJsonValue,
            correctIndex,
            explanation: `${q.explanation} (${q.sourceRef})`,
          };
        });

        const quiz = await prisma.quiz.create({
          data: {
            userId,
            title: baseTitle,
            topic: set.questions[0]?.topic ?? 'Document Practice',
            questions: { create: quizQuestions },
          },
        });
        quizId = quiz.id;
      }

      if ((opts.target === 'deck' || opts.target === 'both') && !deckId) {
        const deck = await prisma.deck.create({
          data: {
            userId,
            title: baseTitle,
            topic: set.questions[0]?.topic ?? 'Document Flashcards',
            cards: {
              create: set.questions.map((q, idx) => ({
                position: idx + 1,
                front: q.prompt,
                back: `${q.correctAnswer}\n\n${q.explanation} (${q.sourceRef})`,
              })),
            },
          },
        });
        deckId = deck.id;
      }

      await prisma.generatedQuestionSet.update({
        where: { id: set.id },
        data: { quizId, deckId },
      });

      return { quizId, deckId };
    },

    async exportQuestionSet(userId, setId, format) {
      const set = await prisma.generatedQuestionSet.findFirst({
        where: { id: setId, userId },
        include: { questions: { orderBy: { position: 'asc' } } },
      });
      if (!set) {
        throw new AppError('NOT_FOUND', 'Question set not found');
      }

      const sections = set.questions.map((q, idx) => {
        const optionsLine = Array.isArray(q.optionsJson)
          ? `\nOptions:\n${(q.optionsJson as string[]).map((o, i) => `  ${String.fromCharCode(65 + i)}. ${o}`).join('\n')}`
          : '';
        return {
          heading: `Question ${idx + 1} (${q.type.toUpperCase()} · ${q.difficulty})`,
          meta: `Topic: ${q.topic} · Source: ${q.sourceRef}`,
          prompt: `${q.prompt}${optionsLine}`,
          body: `Answer: ${q.correctAnswer}\n\nExplanation: ${q.explanation}`,
        };
      });

      const safeBase = sanitizeFilename(set.title).replace(/\s+/g, '_');
      if (format === 'pdf') {
        const buffer = await buildPdfBuffer({
          title: set.title,
          subtitle: `Generated by LearnSpace AI (${set.questions.length} questions)`,
          sections,
        });
        return {
          buffer,
          mimeType: 'application/pdf',
          filename: `${safeBase}.pdf`,
        };
      }

      const buffer = await buildDocxBuffer({
        title: set.title,
        subtitle: `Generated by LearnSpace AI (${set.questions.length} questions)`,
        sections,
      });
      return {
        buffer,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filename: `${safeBase}.docx`,
      };
    },
  };
}
