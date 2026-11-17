import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rateLimit';
import { asyncHandler, validate } from '../../middleware/validate';
import { MAX_DOC_BYTES } from '../ai/attachments.service';
import {
  answerQuestionSchema,
  exportDocumentSchema,
  generateQuestionsSchema,
  listDocumentsQuerySchema,
  patchQuestionsSchema,
  refineGeneratedQuestionSchema,
  saveSetToLibrarySchema,
  saveToNotesSchema,
  submitPracticeAttemptSchema,
  uploadDocumentMetaSchema,
} from './documents.schemas';
import type { DocumentsService } from './documents.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOC_BYTES, files: 1 },
});

const handleDocumentMulter: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('PAYLOAD_TOO_LARGE', 'File must be 20 MB or smaller'));
      return;
    }
    next(new AppError('VALIDATION_ERROR', 'Invalid file upload'));
  });
};

const uuidSchema = z.string().uuid();

export interface DocumentsRouterDeps {
  documents: DocumentsService;
  env: Env;
  isEmailVerified: (userId: string) => Promise<boolean>;
}

export function documentsRouter({
  documents,
  env,
  isEmailVerified,
}: DocumentsRouterDeps): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);
  const verified = requireVerifiedEmail(isEmailVerified);

  const uploadLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    skip: () => env.NODE_ENV === 'test',
  });

  router.post(
    '/documents',
    auth,
    verified,
    uploadLimiter,
    handleDocumentMulter,
    asyncHandler(async (req, res) => {
      if (!req.file?.buffer) {
        throw new AppError('VALIDATION_ERROR', 'Attach a file under the "file" field');
      }

      const parsed = uploadDocumentMetaSchema.safeParse({
        type: req.body?.type,
        title: typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title : undefined,
        courseId:
          typeof req.body?.courseId === 'string' && req.body.courseId.trim()
            ? req.body.courseId
            : undefined,
      });
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid document metadata');
      }

      const result = await documents.upload({
        userId: req.user!.id,
        type: parsed.data.type,
        title: parsed.data.title,
        courseId: parsed.data.courseId,
        filename: req.file.originalname || 'document',
        declaredMime: req.file.mimetype || 'application/octet-stream',
        buffer: req.file.buffer,
      });

      res.status(202).json(result);
    }),
  );

  router.get(
    '/documents',
    auth,
    validate({ query: listDocumentsQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof listDocumentsQuerySchema>;
      const result = await documents.list(req.user!.id, query);
      res.setHeader('Cache-Control', 'private, max-age=10');
      res.json(result);
    }),
  );

  router.get(
    '/documents/:id',
    auth,
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        throw new AppError('NOT_FOUND', 'Document not found');
      }
      const detail = await documents.getDetail(req.user!.id, parsedId.data);
      res.json(detail);
    }),
  );

  router.get(
    '/documents/:id/content',
    auth,
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        throw new AppError('NOT_FOUND', 'Document not found');
      }
      const content = await documents.getContent(req.user!.id, parsedId.data);
      if (content.redirectUrl) {
        res.redirect(302, content.redirectUrl);
        return;
      }
      res.setHeader('Content-Type', content.mimeType);
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${content.filename.replace(/"/g, '')}"`,
      );
      res.send(content.bytes);
    }),
  );

  router.delete(
    '/documents/:id',
    auth,
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        throw new AppError('NOT_FOUND', 'Document not found');
      }
      await documents.remove(req.user!.id, parsedId.data);
      res.status(204).send();
    }),
  );

  const aiLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: 20,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    skip: () => env.NODE_ENV === 'test',
  });

  router.post(
    '/documents/:id/detect-questions',
    auth,
    verified,
    aiLimiter,
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        throw new AppError('NOT_FOUND', 'Document not found');
      }
      const job = await documents.enqueueDetectQuestions(req.user!.id, parsedId.data);
      res.status(202).json({ job });
    }),
  );

  router.patch(
    '/documents/:id/questions',
    auth,
    validate({ body: patchQuestionsSchema }),
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        throw new AppError('NOT_FOUND', 'Document not found');
      }
      const body = req.body as z.infer<typeof patchQuestionsSchema>;
      const questions = await documents.patchQuestions(req.user!.id, parsedId.data, body.questions);
      res.json({ questions });
    }),
  );

  router.post(
    '/documents/:id/questions/:qid/answer',
    auth,
    verified,
    aiLimiter,
    validate({ body: answerQuestionSchema }),
    asyncHandler(async (req, res) => {
      const parsedDocId = uuidSchema.safeParse(req.params.id);
      const parsedQid = uuidSchema.safeParse(req.params.qid);
      if (!parsedDocId.success || !parsedQid.success) {
        throw new AppError('NOT_FOUND', 'Question not found');
      }
      const body = req.body as z.infer<typeof answerQuestionSchema>;

      const controller = new AbortController();
      req.on('close', () => controller.abort());

      let headersSent = false;
      const sendEvent = (event: string, data: unknown) => {
        if (!headersSent) {
          res.status(200);
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache, no-transform');
          res.setHeader('Connection', 'keep-alive');
          headersSent = true;
        }
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      const heartbeat = setInterval(() => {
        if (headersSent) res.write(': ping\n\n');
      }, 15_000);

      try {
        const updated = await documents.streamQuestionAnswer({
          userId: req.user!.id,
          documentId: parsedDocId.data,
          questionId: parsedQid.data,
          mode: body.mode,
          useCourseNotes: body.useCourseNotes,
          refinement: body.refinement,
          signal: controller.signal,
          onMeta: (meta) => sendEvent('meta', meta),
          onDelta: (text) => sendEvent('delta', { text }),
        });
        sendEvent('done', { question: updated });
        res.end();
      } catch (err) {
        if (headersSent) {
          const message = err instanceof Error ? err.message : 'Answer generation failed';
          sendEvent('error', { code: 'AI_PROVIDER_ERROR', message });
          res.end();
        } else {
          throw err;
        }
      } finally {
        clearInterval(heartbeat);
      }
    }),
  );

  router.post(
    '/documents/:id/export',
    auth,
    validate({ body: exportDocumentSchema }),
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        throw new AppError('NOT_FOUND', 'Document not found');
      }
      const body = req.body as z.infer<typeof exportDocumentSchema>;
      const exported = await documents.exportAnswers(req.user!.id, parsedId.data, body.format);
      res.setHeader('Content-Type', exported.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      res.send(exported.buffer);
    }),
  );

  router.post(
    '/documents/:id/save-to-notes',
    auth,
    validate({ body: saveToNotesSchema }),
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        throw new AppError('NOT_FOUND', 'Document not found');
      }
      const body = req.body as z.infer<typeof saveToNotesSchema>;
      const saved = await documents.saveAnswersToNotes(req.user!.id, parsedId.data, body);
      res.status(201).json(saved);
    }),
  );

  router.post(
    '/documents/:id/generate-questions',
    auth,
    verified,
    aiLimiter,
    validate({ body: generateQuestionsSchema }),
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id);
      if (!parsedId.success) {
        throw new AppError('NOT_FOUND', 'Document not found');
      }
      const body = req.body as z.infer<typeof generateQuestionsSchema>;
      const job = await documents.enqueueGenerateQuestions(req.user!.id, parsedId.data, body);
      res.status(202).json({ job });
    }),
  );

  router.post(
    '/question-sets/:setId/questions/:qid/refine',
    auth,
    verified,
    aiLimiter,
    validate({ body: refineGeneratedQuestionSchema }),
    asyncHandler(async (req, res) => {
      const parsedSetId = uuidSchema.safeParse(req.params.setId);
      const parsedQid = uuidSchema.safeParse(req.params.qid);
      if (!parsedSetId.success || !parsedQid.success) {
        throw new AppError('NOT_FOUND', 'Question not found');
      }
      const body = req.body as z.infer<typeof refineGeneratedQuestionSchema>;
      const result = await documents.refineGeneratedQuestion(
        req.user!.id,
        parsedSetId.data,
        parsedQid.data,
        body.action,
      );
      res.json(result);
    }),
  );

  router.post(
    '/question-sets/:setId/attempts',
    auth,
    validate({ body: submitPracticeAttemptSchema }),
    asyncHandler(async (req, res) => {
      const parsedSetId = uuidSchema.safeParse(req.params.setId);
      if (!parsedSetId.success) {
        throw new AppError('NOT_FOUND', 'Question set not found');
      }
      const body = req.body as z.infer<typeof submitPracticeAttemptSchema>;
      const attempt = await documents.submitPracticeAttempt(req.user!.id, parsedSetId.data, body.answers);
      res.status(201).json({ attempt });
    }),
  );

  router.post(
    '/question-sets/:setId/save-to-library',
    auth,
    validate({ body: saveSetToLibrarySchema }),
    asyncHandler(async (req, res) => {
      const parsedSetId = uuidSchema.safeParse(req.params.setId);
      if (!parsedSetId.success) {
        throw new AppError('NOT_FOUND', 'Question set not found');
      }
      const body = req.body as z.infer<typeof saveSetToLibrarySchema>;
      const result = await documents.saveSetToLibrary(req.user!.id, parsedSetId.data, body);
      res.status(201).json(result);
    }),
  );

  router.post(
    '/question-sets/:setId/export',
    auth,
    validate({ body: exportDocumentSchema }),
    asyncHandler(async (req, res) => {
      const parsedSetId = uuidSchema.safeParse(req.params.setId);
      if (!parsedSetId.success) {
        throw new AppError('NOT_FOUND', 'Question set not found');
      }
      const body = req.body as z.infer<typeof exportDocumentSchema>;
      const exported = await documents.exportQuestionSet(req.user!.id, parsedSetId.data, body.format);
      res.setHeader('Content-Type', exported.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      res.send(exported.buffer);
    }),
  );

  return router;
}

