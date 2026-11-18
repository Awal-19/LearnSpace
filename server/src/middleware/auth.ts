import type { PrismaClient } from '@prisma/client';
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

function requireRole(
  prisma: PrismaClient,
  allowed: Array<'admin' | 'super_admin'>,
): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    if (!req.user) {
      throw new AppError('UNAUTHENTICATED');
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        email: true,
        role: true,
        status: true,
        emailVerified: true,
        suspendedReason: true,
        adminPermissionsJson: true,
      },
    });
    if (!user) {
      throw new AppError('UNAUTHENTICATED');
    }
    const allowedAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    if (allowedAdminEmail && user.email.toLowerCase() !== allowedAdminEmail) {
      throw new AppError('FORBIDDEN');
    }
    if (user.status === 'suspended') {
      throw new AppError(
        'ACCOUNT_SUSPENDED',
        user.suspendedReason
          ? `Your account has been suspended: ${user.suspendedReason}`
          : undefined,
      );
    }
    if (!user.emailVerified) {
      throw new AppError('EMAIL_NOT_VERIFIED');
    }
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      throw new AppError('FORBIDDEN');
    }
    if (!allowed.includes(user.role)) {
      throw new AppError('FORBIDDEN', 'Super admin privileges required');
    }
    req.adminRole = user.role;
    req.adminPermissions =
      user.adminPermissionsJson && typeof user.adminPermissionsJson === 'object'
        ? (user.adminPermissionsJson as Record<string, boolean>)
        : {};
    next();
  });
}

export type AdminPermission =
  | 'can_manage_users'
  | 'can_moderate_content'
  | 'can_view_ai_usage'
  | 'can_send_announcements'
  | 'can_export_data';

/**
 * Enforces granular permissions for regular `admin` accounts.
 * `super_admin` always bypasses granular permission checks.
 */
export function requirePermission(permission: AdminPermission): RequestHandler {
  return (req, _res, next) => {
    if (req.adminRole === 'super_admin') {
      next();
      return;
    }
    if (req.adminPermissions?.[permission] === false) {
      next(new AppError('FORBIDDEN', `Missing required permission: ${permission}`));
      return;
    }
    next();
  };
}

/** Requires an active, verified user with role `admin` or `super_admin`. */
export function requireAdmin(prisma: PrismaClient): RequestHandler {
  return requireRole(prisma, ['admin', 'super_admin']);
}

/** Requires an active, verified user with role `super_admin`. */
export function requireSuperAdmin(prisma: PrismaClient): RequestHandler {
  return requireRole(prisma, ['super_admin']);
}
