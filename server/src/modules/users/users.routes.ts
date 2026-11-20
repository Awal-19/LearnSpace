import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rateLimit';
import { asyncHandler, validateBody } from '../../middleware/validate';
import { REFRESH_COOKIE_NAME } from '../auth/auth.routes';
import {
  avatarConfigSchema,
  changePasswordSchema,
  deleteAccountSchema,
  updateProfileSchema,
  updateSettingsSchema,
  type AvatarConfig,
} from './users.schemas';
import type { UsersService } from './users.service';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
const uuidSchema = z.string().uuid();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AVATAR_BYTES, files: 1 },
});

const handleAvatarMulter: RequestHandler = (req, res, next) => {
  upload.single('avatar')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('PAYLOAD_TOO_LARGE', 'Avatar must be 5 MB or smaller'));
      return;
    }
    next(new AppError('VALIDATION_ERROR', 'Invalid file upload'));
  });
};

export function usersRouter(users: UsersService, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);

  const avatarLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    skip: () => env.NODE_ENV === 'test',
  });

  const exportLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    skip: () => env.NODE_ENV === 'test',
  });

  router.get(
    '/users/me',
    auth,
    asyncHandler(async (req, res) => {
      const user = await users.getMe(req.user!.id);
      res.json(user);
    }),
  );

  router.patch(
    '/users/me',
    auth,
    validateBody(updateProfileSchema),
    asyncHandler(async (req, res) => {
      const user = await users.updateMe(req.user!.id, req.body);
      res.json(user);
    }),
  );

  router.post(
    '/users/me/first-visit',
    auth,
    asyncHandler(async (req, res) => {
      const result = await users.acknowledgeFirstVisit(req.user!.id);
      res.json(result);
    }),
  );

  router.post(
    '/users/me/onboarding-complete',
    auth,
    asyncHandler(async (req, res) => {
      const result = await users.completeOnboarding(req.user!.id);
      res.json(result);
    }),
  );

  router.get(
    '/users/:id/avatar',
    asyncHandler(async (req, res) => {
      const parsedId = uuidSchema.safeParse(req.params.id ?? '');
      if (!parsedId.success) {
        throw new AppError('NOT_FOUND', 'Avatar not found');
      }

      const record = await users.getAvatarImage(parsedId.data);
      if (!record) {
        throw new AppError('NOT_FOUND', 'Avatar not found');
      }

      const etagHeader = `"${record.etag}"`;
      if (req.header('if-none-match') === etagHeader) {
        res.status(304).end();
        return;
      }

      const versioned = typeof req.query.v === 'string' && req.query.v.length > 0;
      res.setHeader('Content-Type', record.mimeType);
      res.setHeader('ETag', etagHeader);
      res.setHeader(
        'Cache-Control',
        versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      );
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.send(Buffer.from(record.data));
    }),
  );

  router.post(
    '/users/me/avatar',
    auth,
    avatarLimiter,
    handleAvatarMulter,
    asyncHandler(async (req, res) => {
      if (!req.file?.buffer) {
        throw new AppError('VALIDATION_ERROR', 'Attach an image file under the "avatar" field');
      }
      let avatarConfig: AvatarConfig | null = null;
      if (typeof req.body?.config === 'string' && req.body.config.trim() !== '') {
        let raw: unknown;
        try {
          raw = JSON.parse(req.body.config);
        } catch {
          throw new AppError('VALIDATION_ERROR', 'Invalid avatar configuration JSON');
        }
        const parsed = avatarConfigSchema.safeParse(raw);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Invalid avatar configuration values');
        }
        avatarConfig = parsed.data;
      }
      const result = await users.uploadAvatar(req.user!.id, req.file.buffer, avatarConfig);
      res.json(result);
    }),
  );

  router.delete(
    '/users/me/avatar',
    auth,
    asyncHandler(async (req, res) => {
      await users.deleteAvatar(req.user!.id);
      res.status(204).end();
    }),
  );

  router.post(
    '/users/me/change-password',
    auth,
    validateBody(changePasswordSchema),
    asyncHandler(async (req, res) => {
      const currentRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
      await users.changePassword(req.user!.id, req.body, currentRefreshToken);
      res.status(204).end();
    }),
  );

  router.delete(
    '/users/me',
    auth,
    validateBody(deleteAccountSchema),
    asyncHandler(async (req, res) => {
      await users.deleteAccount(req.user!.id, req.body, req.user!.iat);
      const isProd = env.NODE_ENV === 'production';
      res.clearCookie(REFRESH_COOKIE_NAME, {
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
        path: '/api/v1/auth',
      });
      res.status(204).end();
    }),
  );

  router.get(
    '/users/me/stats',
    auth,
    asyncHandler(async (req, res) => {
      const stats = await users.getStats(req.user!.id);
      res.json(stats);
    }),
  );

  router.get(
    '/users/me/settings',
    auth,
    asyncHandler(async (req, res) => {
      const settings = await users.getSettings(req.user!.id);
      res.json(settings);
    }),
  );

  router.patch(
    '/users/me/settings',
    auth,
    validateBody(updateSettingsSchema),
    asyncHandler(async (req, res) => {
      const settings = await users.updateSettings(req.user!.id, req.body);
      res.json(settings);
    }),
  );

  router.get(
    '/users/me/export',
    auth,
    exportLimiter,
    asyncHandler(async (req, res) => {
      const payload = await users.exportMyData(req.user!.id);
      const day = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="learnspace-export-${day}.json"`);
      res.send(JSON.stringify(payload, null, 2));
    }),
  );

  return router;
}
