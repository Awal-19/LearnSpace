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
      req.user = { id: payload.userId, iat: payload.iat, scope: payload.scope };
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

/**
 * Single source-of-truth verification & account-status gate.
 * Always reads emailVerified, status, and tokensValidAfter from the database
 * (or fallback callback in isolated unit tests), never trusting token claims.
 */
export function requireVerified(
  prismaOrCheck: PrismaClient | ((userId: string) => Promise<boolean>),
): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    if (!req.user) {
      throw new AppError('UNAUTHENTICATED');
    }
    if (req.user.scope === 'verify_only') {
      throw new AppError('EMAIL_NOT_VERIFIED');
    }
    if (typeof prismaOrCheck === 'function') {
      const verified = await prismaOrCheck(req.user.id);
      if (!verified) {
        throw new AppError('EMAIL_NOT_VERIFIED');
      }
      next();
      return;
    }

    const row = await prismaOrCheck.user.findUnique({
      where: { id: req.user.id },
      select: {
        status: true,
        emailVerified: true,
        tokensValidAfter: true,
      },
    });
    if (!row) {
      throw new AppError('UNAUTHENTICATED');
    }
    if (row.status === 'suspended') {
      throw new AppError('ACCOUNT_SUSPENDED');
    }
    if (
      row.tokensValidAfter &&
      (!req.user.iat || req.user.iat < Math.floor(row.tokensValidAfter.getTime() / 1000))
    ) {
      throw new AppError('UNAUTHENTICATED');
    }
    if (!row.emailVerified) {
      throw new AppError('EMAIL_NOT_VERIFIED');
    }
    next();
  });
}

/**
 * Enforces guardian consent for under-18 students on all non-consent endpoints.
 */
export function requireGuardianConsent(prisma: PrismaClient): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    if (!req.user) {
      next();
      return;
    }
    const row = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { ageGroup: true, guardianConsentStatus: true },
    });
    if (row && row.ageGroup === 'under_18' && row.guardianConsentStatus !== 'given') {
      throw new AppError('GUARDIAN_CONSENT_REQUIRED');
    }
    next();
  });
}

/**
 * Enforces learnerType isolation on university-only (/gpa/*) and SHS-only (/shs/*) routes.
 */
export function requireLearnerType(
  prisma: PrismaClient,
  expected: 'university' | 'shs',
): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    if (!req.user) {
      throw new AppError('UNAUTHENTICATED');
    }
    const row = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { learnerType: true, role: true },
    });
    if (!row) {
      throw new AppError('UNAUTHENTICATED');
    }
    if (row.role !== 'admin' && row.role !== 'super_admin' && row.learnerType !== expected) {
      throw new AppError(
        'FORBIDDEN',
        expected === 'university'
          ? 'This feature is only available for university accounts.'
          : 'This feature is only available for SHS accounts.',
      );
    }
    next();
  });
}

/** Alias kept for route-level readability. */
export const requireVerifiedEmail = requireVerified;

function requireRole(
  prisma: PrismaClient,
  allowed: Array<'admin' | 'super_admin'>,
): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    if (!req.user) {
      throw new AppError('UNAUTHENTICATED');
    }
    if (req.user.scope === 'verify_only') {
      throw new AppError('EMAIL_NOT_VERIFIED');
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
    if (req.adminPermissions?.[permission] !== true) {
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
