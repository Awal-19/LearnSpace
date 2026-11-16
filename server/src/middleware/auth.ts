import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';
import { asyncHandler } from './validate';

/** Requires a valid Bearer access token; attaches req.user. */
export function requireAuth(jwtSecret: string): RequestHandler {
  return (req, _res, next) => {
    const header = req.header('authorization');
    if (!header || !header.startsWith('Bearer ')) {
      next(new AppError('UNAUTHENTICATED'));
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      next(new AppError('UNAUTHENTICATED'));
      return;
    }
    try {
      const payload = verifyAccessToken(token, jwtSecret);
      req.user = { id: payload.userId, iat: payload.iat };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * CSRF guard for cookie-authenticated endpoints (/auth/refresh, /auth/logout).
 * Cross-origin forms cannot set custom headers, and CORS rejects untrusted origins.
 */
export const csrfGuard: RequestHandler = (req, _res, next) => {
  if (req.header('x-requested-with') !== 'learnspace') {
    next(new AppError('CSRF_BLOCKED'));
    return;
  }
  next();
};

/** Requires the authenticated user to have verified their email address. */
export function requireVerifiedEmail(
  isEmailVerified: (userId: string) => Promise<boolean>,
): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    if (!req.user) {
      throw new AppError('UNAUTHENTICATED');
    }
    const verified = await isEmailVerified(req.user.id);
    if (!verified) {
      throw new AppError('EMAIL_NOT_VERIFIED');
    }
    next();
  });
}

