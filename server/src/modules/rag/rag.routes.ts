import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rateLimit';
import { asyncHandler } from '../../middleware/validate';
import type { RagService } from './rag.service';

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_BYTES, files: 1 },
});

const handlePdfUpload: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('PAYLOAD_TOO_LARGE', 'PDF must be 10 MB or smaller'));
      return;
    }
    next(new AppError('VALIDATION_ERROR', 'Invalid PDF upload'));
  });
};

const uuidSchema = z.string().uuid();

export interface RagRouterDeps {
  rag: RagService;
  env: Env;
  isEmailVerified: (userId: string) => Promise<boolean>;
}

export function ragRouter({ rag, env, isEmailVerified }: RagRouterDeps): Router {
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
    '/ai/upload-notes',
    auth,
    verified,
    uploadLimiter,
    handlePdfUpload,
    asyncHandler(async (req, res) => {
      if (!req.file?.buffer) {
        throw new AppError('VALIDATION_ERROR', 'Attach a PDF file under the "file" field');
      }
      const doc = await rag.uploadPdf(req.user!.id, req.file.originalname, req.file.buffer);
      res.status(201).json(doc);
    }),
  );

  router.get(
    '/ai/documents',
    auth,
    asyncHandler(async (req, res) => {
      const docs = await rag.listDocuments(req.user!.id);
      res.json(docs);
    }),
  );

  router.delete(
    '/ai/documents/:id',
    auth,
    asyncHandler(async (req, res) => {
      const parsed = uuidSchema.safeParse(req.params.id ?? '');
      if (!parsed.success) throw new AppError('NOT_FOUND', 'Document not found');
      await rag.deleteDocument(req.user!.id, parsed.data);
      res.status(204).end();
    }),
  );

  return router;
}

