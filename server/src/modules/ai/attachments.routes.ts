import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rateLimit';
import { asyncHandler } from '../../middleware/validate';
import { MAX_DOC_BYTES, type AttachmentsService } from './attachments.service';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOC_BYTES, files: 1 },
});

const handleAttachmentMulter: RequestHandler = (req, res, next) => {
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

export interface AttachmentsRouterDeps {
  attachments: AttachmentsService;
  env: Env;
  isEmailVerified: (userId: string) => Promise<boolean>;
}

export function attachmentsRouter({
  attachments,
  env,
  isEmailVerified,
}: AttachmentsRouterDeps): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);
  const verified = requireVerifiedEmail(isEmailVerified);

  const uploadLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    skip: () => env.NODE_ENV === 'test',
  });

  router.post(
    '/ai/attachments',
    auth,
    verified,
    uploadLimiter,
    handleAttachmentMulter,
    asyncHandler(async (req, res) => {
      if (!req.file?.buffer) {
        throw new AppError('VALIDATION_ERROR', 'Attach a file under the "file" field');
      }
      const conversationId =
        typeof req.body?.conversationId === 'string' ? req.body.conversationId : '';
      const parsedConv = uuidSchema.safeParse(conversationId);
      if (!parsedConv.success) {
        throw new AppError('VALIDATION_ERROR', 'Valid conversationId is required');
      }

      const created = await attachments.upload({
        userId: req.user!.id,
        conversationId: parsedConv.data,
        filename: req.file.originalname,
        declaredMime: req.file.mimetype,
        buffer: req.file.buffer,
      });
      res.status(201).json(created);
    }),
  );

  router.get(
    '/ai/attachments/:id/content',
    auth,
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id ?? '');
      if (!parsedId.success) throw new AppError('NOT_FOUND', 'Attachment not found');

      const { attachment, signedUrl, buffer } = await attachments.getContent(
        req.user!.id,
        parsedId.data,
      );
      if (signedUrl) {
        res.redirect(302, signedUrl);
        return;
      }
      res.setHeader('Content-Type', attachment.mimeType);
      res.setHeader(
        'Content-Disposition',
        `${attachment.kind === 'image' ? 'inline' : 'attachment'}; filename="${attachment.originalName}"`,
      );
      res.send(buffer);
    }),
  );

  router.delete(
    '/ai/attachments/:id',
    auth,
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id ?? '');
      if (!parsedId.success) throw new AppError('NOT_FOUND', 'Attachment not found');
      await attachments.deleteAttachment(req.user!.id, parsedId.data);
      res.status(204).end();
    }),
  );

  return router;
}

