import { Router, type RequestHandler } from 'express';
import multer from 'multer';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rateLimit';
import { asyncHandler, validateBody } from '../../middleware/validate';
import { REFRESH_COOKIE_NAME } from '../auth/auth.routes';
import {
  changePasswordSchema,
  deleteAccountSchema,
  updateProfileSchema,
  updateSettingsSchema,
} from './users.schemas';
import type { UsersService } from './users.service';

const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

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
      next(new AppError('PAYLOAD_TOO_LARGE', 'Avatar must be 2 MB or smaller'));
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
    '/users/me/avatar',
    auth,
    avatarLimiter,
    handleAvatarMulter,
    asyncHandler(async (req, res) => {
      if (!req.file?.buffer) {
        throw new AppError('VALIDATION_ERROR', 'Attach an image file under the "avatar" field');
      }
      const result = await users.uploadAvatar(req.user!.id, req.file.buffer);
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
      res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
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

  return router;
}

