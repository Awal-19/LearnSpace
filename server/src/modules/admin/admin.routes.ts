import { createHash, timingSafeEqual } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { Router, type Request } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { safeContentDispositionFilename } from '../../lib/http';
import {
  requireAdmin,
  requireAuth,
  requirePermission,
  requireSuperAdmin,
} from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rateLimit';
import { asyncHandler, validate } from '../../middleware/validate';
import { recordAuditLog } from './admin.logging';
import { HARDCODED_DENY_DOMAINS } from '../courses/recommendations.safety';
import {
  acceptAdminInviteSchema,
  bulkUsersSchema,
  createAnnouncementSchema,
  createExportSchema,
  inspectContentSchema,
  inviteAdminSchema,
  listUsersQuerySchema,
  markEmailVerifiedSchema,
  overviewQuerySchema,
  paginationQuerySchema,
  replyFeedbackSchema,
  resolveFlagSchema,
  resolveRecommendationReportSchema,
  resolveCommunityReportSchema,
  rollbackSettingsSchema,
  setCommunityRoleSchema,
  stepUpVerifySchema,
  studentFeedbackSchema,
  studentFlagMessageSchema,
  updateAdminPermissionsSchema,
  updateAiLimitsSchema,
  updateAnnouncementSchema,
  updateAppSettingsSchema,
  updateCommunitySettingsSchema,
  updateFeedbackSchema,
  updatePlatformSettingsSchema,
  updateRecommendationSettingsSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  uuidParamSchema,
} from './admin.schemas';
import type { AdminService } from './admin.service';

export interface AdminRouterDeps {
  admin: AdminService;
  prisma: PrismaClient;
  env: Env;
}

export function adminRouter({ admin, prisma, env }: AdminRouterDeps): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);
  const adminOnly = requireAdmin(prisma);
  const superAdminOnly = requireSuperAdmin(prisma);

  const adminLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: 120,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    skip: () => env.NODE_ENV === 'test',
  });

  router.use(auth, adminOnly, adminLimiter);

  const ADMIN_UNLOCK_COOKIE = 'learnspace_admin_unlock';
  const unlockBodySchema = z.object({ password: z.string().min(1).max(200) }).strict();

  function isConsoleUnlocked(req: Request): boolean {
    if (!env.ADMIN_CONSOLE_PASSWORD) return true;
    const raw = (req.cookies as Record<string, unknown> | undefined)?.[ADMIN_UNLOCK_COOKIE];
    if (typeof raw !== 'string' || !raw) return false;
    try {
      const payload = jwt.verify(raw, env.JWT_SECRET, { algorithms: ['HS256'] }) as {
        sub?: string;
        purpose?: string;
      };
      return payload.purpose === 'admin_console_unlock' && payload.sub === req.user?.id;
    } catch {
      return false;
    }
  }

  router.get('/console-unlock/status', (req, res) => {
    res.json({
      required: Boolean(env.ADMIN_CONSOLE_PASSWORD),
      unlocked: isConsoleUnlocked(req),
    });
  });

  router.post(
    '/console-unlock',
    validate({ body: unlockBodySchema }),
    asyncHandler(async (req, res) => {
      const expected = env.ADMIN_CONSOLE_PASSWORD;
      if (!expected) {
        res.json({ unlocked: true });
        return;
      }
      const { password } = req.body as z.infer<typeof unlockBodySchema>;
      const a = createHash('sha256').update(password).digest();
      const b = createHash('sha256').update(expected).digest();
      if (!timingSafeEqual(a, b)) {
        throw new AppError('FORBIDDEN', 'Incorrect admin console password');
      }
      const token = jwt.sign({ purpose: 'admin_console_unlock' }, env.JWT_SECRET, {
        algorithm: 'HS256',
        subject: req.user!.id,
        expiresIn: '2h',
      });
      res.cookie(ADMIN_UNLOCK_COOKIE, token, {
        httpOnly: true,
        sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: env.NODE_ENV === 'production',
        maxAge: 2 * 60 * 60 * 1000,
        path: '/',
      });
      await recordAuditLog(prisma, {
        actorId: req.user!.id,
        action: 'admin.console_unlock',
        targetType: 'system',
        ip: req.ip,
      });
      res.json({ unlocked: true });
    }),
  );

  router.use((req, _res, next) => {
    if (!isConsoleUnlocked(req)) {
      next(new AppError('FORBIDDEN', 'Admin console password required'));
      return;
    }
    next();
  });

  const SUPER_STEP_UP_COOKIE = 'learnspace_super_stepup';

  function isStepUpValid(req: Request): boolean {
    const raw = (req.cookies as Record<string, unknown> | undefined)?.[SUPER_STEP_UP_COOKIE];
    if (typeof raw !== 'string' || !raw) return false;
    try {
      const payload = jwt.verify(raw, env.JWT_SECRET, { algorithms: ['HS256'] }) as {
        sub?: string;
        purpose?: string;
      };
      return payload.purpose === 'super_step_up' && payload.sub === req.user?.id;
    } catch {
      return false;
    }
  }

  const requireStepUp = asyncHandler(async (req, _res, next) => {
    if (isStepUpValid(req)) {
      next();
      return;
    }
    const headerPassword = req.header('x-step-up-password');
    const headerCode = req.header('x-step-up-otp');
    if (headerPassword || headerCode) {
      await admin.verifyStepUp(req.user!.id, {
        ...(headerPassword ? { password: headerPassword } : {}),
        ...(headerCode ? { code: headerCode } : {}),
      });
      next();
      return;
    }
    throw new AppError('FORBIDDEN', 'Step-up verification required for this Super Admin action');
  });

  router.get(
    '/overview',
    validate({ query: overviewQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof overviewQuerySchema>;
      const data = await admin.getOverview(query);
      res.json(data);
    }),
  );

  router.get(
    '/users',
    requirePermission('can_manage_users'),
    validate({ query: listUsersQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof listUsersQuerySchema>;
      const data = await admin.listUsers(query);
      res.json(data);
    }),
  );

  router.get(
    '/users/:id',
    requirePermission('can_manage_users'),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'User not found');
      const data = await admin.getUserDetail(id.data);
      res.json(data);
    }),
  );

  router.patch(
    '/users/:id/status',
    requirePermission('can_manage_users'),
    validate({ body: updateUserStatusSchema }),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'User not found');
      const body = req.body as z.infer<typeof updateUserStatusSchema>;
      const updated = await admin.setUserStatus(
        req.user!.id,
        id.data,
        body.status,
        body.reason,
        req.ip,
      );
      res.json({ user: updated });
    }),
  );

  router.post(
    '/users/:id/force-logout',
    requirePermission('can_manage_users'),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'User not found');
      await admin.forceLogout(req.user!.id, id.data, req.ip);
      res.status(204).end();
    }),
  );

  const adminResendLimiter = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => `admin-resend:${req.user?.id ?? req.ip ?? 'unknown'}`,
    skip: () => env.NODE_ENV === 'test',
  });

  router.post(
    '/users/:id/resend-verification',
    requirePermission('can_manage_users'),
    adminResendLimiter,
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'User not found');
      const result = await admin.resendVerification(req.user!.id, id.data, req.ip);
      res.json(result);
    }),
  );

  router.post(
    '/users/:id/mark-verified',
    requirePermission('can_manage_users'),
    requireStepUp,
    validate({ body: markEmailVerifiedSchema }),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'User not found');
      const result = await admin.markEmailVerified(req.user!.id, id.data, req.body.reason, req.ip);
      res.json(result);
    }),
  );

  router.post(
    '/users/:id/trigger-reset',
    requirePermission('can_manage_users'),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'User not found');
      await admin.triggerPasswordReset(req.user!.id, id.data, req.ip);
      res.status(204).end();
    }),
  );

  router.patch(
    '/users/:id/role',
    superAdminOnly,
    requireStepUp,
    validate({ body: updateUserRoleSchema }),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'User not found');
      const body = req.body as z.infer<typeof updateUserRoleSchema>;
      const updated = await admin.setUserRole(
        req.user!.id,
        id.data,
        body.role,
        body.reason,
        req.ip,
      );
      res.json({ user: updated });
    }),
  );

  router.delete(
    '/users/:id',
    requirePermission('can_manage_users'),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'User not found');
      await admin.deleteUser(req.user!.id, id.data, req.ip);
      res.status(204).end();
    }),
  );

  router.post(
    '/users/bulk',
    requirePermission('can_manage_users'),
    validate({ body: bulkUsersSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof bulkUsersSchema>;
      const result = await admin.bulkUsers(req.user!.id, body, req.ip);
      if ('csv' in result) {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="learnspace-users.csv"');
        res.send(result.csv);
        return;
      }
      res.json(result);
    }),
  );

  router.get(
    '/ai-usage',
    requirePermission('can_view_ai_usage'),
    validate({ query: overviewQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof overviewQuerySchema>;
      const data = await admin.getAiUsage(query);
      res.json(data);
    }),
  );

  router.patch(
    '/ai-usage/limits',
    superAdminOnly,
    requireStepUp,
    validate({ body: updateAiLimitsSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof updateAiLimitsSchema>;
      const settings = await admin.updateAiLimits(req.user!.id, body, req.ip);
      res.json({ settings });
    }),
  );

  router.get(
    '/conversations',
    validate({ query: paginationQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof paginationQuerySchema>;
      const data = await admin.listConversationsMeta(query);
      res.json(data);
    }),
  );

  router.post(
    '/conversations/:id/inspect',
    validate({ body: inspectContentSchema }),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'Conversation not found');
      const body = req.body as z.infer<typeof inspectContentSchema>;
      const conversation = await admin.inspectConversation(
        req.user!.id,
        id.data,
        body.reason,
        req.ip,
      );
      res.json({ conversation });
    }),
  );

  router.get(
    '/uploads',
    validate({ query: paginationQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof paginationQuerySchema>;
      const data = await admin.listUploads(query);
      res.json(data);
    }),
  );

  router.post(
    '/uploads/:kind/:id/inspect',
    validate({ body: inspectContentSchema }),
    asyncHandler(async (req, res) => {
      const kind = req.params.kind;
      const id = uuidParamSchema.safeParse(req.params.id);
      if ((kind !== 'attachment' && kind !== 'document') || !id.success) {
        throw new AppError('NOT_FOUND', 'Upload not found');
      }
      const body = req.body as z.infer<typeof inspectContentSchema>;
      const item = await admin.inspectUpload(req.user!.id, kind, id.data, body.reason, req.ip);
      res.json({ item });
    }),
  );

  router.delete(
    '/uploads/:kind/:id',
    asyncHandler(async (req, res) => {
      const kind = req.params.kind;
      const id = uuidParamSchema.safeParse(req.params.id);
      if ((kind !== 'attachment' && kind !== 'document') || !id.success) {
        throw new AppError('NOT_FOUND', 'Upload not found');
      }
      await admin.deleteUpload(req.user!.id, kind, id.data, req.ip);
      res.status(204).end();
    }),
  );

  router.get(
    '/flagged',
    validate({ query: paginationQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof paginationQuerySchema>;
      const data = await admin.listFlaggedContent(query);
      res.json(data);
    }),
  );

  router.patch(
    '/flagged/:id',
    validate({ body: resolveFlagSchema }),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'Flagged item not found');
      const body = req.body as z.infer<typeof resolveFlagSchema>;
      const updated = await admin.resolveFlaggedContent(req.user!.id, id.data, body, req.ip);
      res.json({ flag: updated });
    }),
  );

  router.get(
    '/learning',
    asyncHandler(async (_req, res) => {
      const data = await admin.getLearningStats();
      res.json(data);
    }),
  );

  // Announcements
  router.get(
    '/announcements',
    asyncHandler(async (_req, res) => {
      const items = await admin.listAnnouncements();
      res.json({ items });
    }),
  );

  router.post(
    '/announcements',
    validate({ body: createAnnouncementSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof createAnnouncementSchema>;
      const item = await admin.createAnnouncement(req.user!.id, body, req.ip);
      res.status(201).json({ announcement: item });
    }),
  );

  router.patch(
    '/announcements/:id',
    validate({ body: updateAnnouncementSchema }),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'Announcement not found');
      const body = req.body as z.infer<typeof updateAnnouncementSchema>;
      const updated = await admin.updateAnnouncement(req.user!.id, id.data, body, req.ip);
      res.json({ announcement: updated });
    }),
  );

  router.delete(
    '/announcements/:id',
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'Announcement not found');
      await admin.deleteAnnouncement(req.user!.id, id.data, req.ip);
      res.status(204).end();
    }),
  );

  // Feedback & Support
  router.get(
    '/feedback',
    validate({ query: paginationQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof paginationQuerySchema>;
      const data = await admin.listFeedback(query);
      res.json(data);
    }),
  );

  router.patch(
    '/feedback/:id',
    validate({ body: updateFeedbackSchema }),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'Feedback report not found');
      const body = req.body as z.infer<typeof updateFeedbackSchema>;
      const updated = await admin.updateFeedback(req.user!.id, id.data, body, req.ip);
      res.json({ feedback: updated });
    }),
  );

  router.post(
    '/feedback/:id/reply',
    validate({ body: replyFeedbackSchema }),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'Feedback report not found');
      const body = req.body as z.infer<typeof replyFeedbackSchema>;
      const updated = await admin.replyFeedback(req.user!.id, id.data, body.message, req.ip);
      res.json({ feedback: updated });
    }),
  );

  // Audit Log, Login History, Error Logs, System Health, Settings
  router.get(
    '/audit-logs',
    validate({ query: paginationQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof paginationQuerySchema>;
      const data = await admin.listAuditLogs(query);
      if ('csv' in data) {
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="learnspace-audit-logs.csv"');
        res.send(data.csv);
        return;
      }
      res.json(data);
    }),
  );

  router.get(
    '/login-history',
    validate({ query: paginationQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof paginationQuerySchema>;
      const data = await admin.listLoginHistory(query);
      res.json(data);
    }),
  );

  router.get(
    '/error-logs',
    validate({ query: paginationQuerySchema }),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof paginationQuerySchema>;
      const data = await admin.listErrorLogs(query);
      res.json(data);
    }),
  );

  router.get(
    '/health',
    asyncHandler(async (_req, res) => {
      const data = await admin.getSystemHealth();
      res.json(data);
    }),
  );

  router.get(
    '/settings',
    asyncHandler(async (_req, res) => {
      const settings = await admin.getSettings();
      res.json({ settings });
    }),
  );

  router.patch(
    '/settings',
    superAdminOnly,
    requireStepUp,
    validate({ body: updateAppSettingsSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof updateAppSettingsSchema>;
      const settings = await admin.updateSettings(req.user!.id, body, req.ip);
      res.json({ settings });
    }),
  );

  // ---------------------------------------------------------------- Super Admin Layer
  router.get('/super/step-up/status', superAdminOnly, (req, res) => {
    res.json({ verified: isStepUpValid(req) });
  });

  router.post(
    '/super/step-up/request-otp',
    superAdminOnly,
    asyncHandler(async (req, res) => {
      const result = await admin.requestStepUpOtp(req.user!.id);
      res.json(result);
    }),
  );

  router.post(
    '/super/step-up/verify',
    superAdminOnly,
    validate({ body: stepUpVerifySchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof stepUpVerifySchema>;
      await admin.verifyStepUp(req.user!.id, body);
      const token = jwt.sign({ purpose: 'super_step_up' }, env.JWT_SECRET, {
        algorithm: 'HS256',
        subject: req.user!.id,
        expiresIn: '10m',
      });
      res.cookie(SUPER_STEP_UP_COOKIE, token, {
        httpOnly: true,
        sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
        secure: env.NODE_ENV === 'production',
        maxAge: 10 * 60 * 1000,
        path: '/',
      });
      res.json({ verified: true });
    }),
  );

  router.get(
    '/super/team',
    superAdminOnly,
    requireStepUp,
    asyncHandler(async (_req, res) => {
      const data = await admin.listAdminTeam();
      res.json(data);
    }),
  );

  router.post(
    '/super/team/invite',
    superAdminOnly,
    requireStepUp,
    validate({ body: inviteAdminSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof inviteAdminSchema>;
      const invite = await admin.inviteAdmin(req.user!.id, body, req.ip, req.get('user-agent'));
      res.status(201).json({ invite });
    }),
  );

  router.delete(
    '/super/invites/:id',
    superAdminOnly,
    requireStepUp,
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'Invite not found');
      await admin.revokeAdminInvite(req.user!.id, id.data, req.ip, req.get('user-agent'));
      res.status(204).end();
    }),
  );

  router.patch(
    '/super/team/:id/permissions',
    superAdminOnly,
    requireStepUp,
    validate({ body: updateAdminPermissionsSchema }),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'Admin user not found');
      const body = req.body as z.infer<typeof updateAdminPermissionsSchema>;
      const user = await admin.updateAdminPermissions(
        req.user!.id,
        id.data,
        body.permissions,
        body.reason,
        req.ip,
        req.get('user-agent'),
      );
      res.json({ user });
    }),
  );

  router.get(
    '/super/settings',
    superAdminOnly,
    requireStepUp,
    asyncHandler(async (_req, res) => {
      const data = await admin.getPlatformSettings();
      res.json(data);
    }),
  );

  router.patch(
    '/super/settings',
    superAdminOnly,
    requireStepUp,
    validate({ body: updatePlatformSettingsSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof updatePlatformSettingsSchema>;
      const settings = await admin.updatePlatformSettings(
        req.user!.id,
        body,
        req.ip,
        req.get('user-agent'),
      );
      res.json({ settings });
    }),
  );

  router.post(
    '/super/settings/rollback',
    superAdminOnly,
    requireStepUp,
    validate({ body: rollbackSettingsSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof rollbackSettingsSchema>;
      const settings = await admin.rollbackPlatformSettings(
        req.user!.id,
        body.version,
        body.reason,
        req.ip,
        req.get('user-agent'),
      );
      res.json({ settings });
    }),
  );

  // Reports & Exports
  router.get(
    '/exports',
    requirePermission('can_export_data'),
    asyncHandler(async (req, res) => {
      const jobs = await admin.listExportJobs(req.user!.id);
      res.json({ jobs });
    }),
  );

  router.post(
    '/exports',
    requirePermission('can_export_data'),
    validate({ body: createExportSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof createExportSchema>;
      const job = await admin.createExportJob(req.user!.id, body, req.ip);
      res.status(201).json({ job });
    }),
  );

  router.get(
    '/exports/:id/download',
    requirePermission('can_export_data'),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'Export not found');
      const file = await admin.downloadExportJob(req.user!.id, id.data);
      res.setHeader('Content-Type', file.mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${safeContentDispositionFilename(file.fileName, 'export')}"`,
      );
      res.send(file.bytes);
    }),
  );

  router.get(
    '/recommendations/overview',
    requirePermission('can_view_ai_usage'),
    asyncHandler(async (_req, res) => {
      const monthStart = new Date(
        Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
      );
      const [settings, usageAgg, jobsCount, cacheCount, reports] = await Promise.all([
        prisma.appSettings.findUnique({ where: { id: 'global' } }).catch(() => null),
        prisma.usageEvent.aggregate({
          where: { feature: 'course_resource_search', createdAt: { gte: monthStart } },
          _count: { _all: true },
          _sum: { tokensIn: true, tokensOut: true, costUsd: true },
        }),
        prisma.recommendationJob.count({ where: { createdAt: { gte: monthStart } } }),
        prisma.recommendationCache.count({ where: { expiresAt: { gt: new Date() } } }),
        prisma.recommendationReport.findMany({
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            recommendation: { select: { title: true, status: true, courseId: true } },
            user: { select: { email: true } },
          },
        }),
      ]);

      res.json({
        featureCourseRecommendations: settings?.featureCourseRecommendations ?? true,
        dailyCourseSearchLimit: settings?.dailyCourseSearchLimit ?? 5,
        monthlySearchCostCapUsd: settings?.monthlySearchCostCapUsd ?? 25.0,
        allowDomains: Array.isArray(settings?.recommendationAllowDomainsJson)
          ? settings.recommendationAllowDomainsJson
          : [],
        blockDomains: Array.isArray(settings?.recommendationBlockDomainsJson)
          ? settings.recommendationBlockDomainsJson
          : [],
        hardcodedDenyDomains: HARDCODED_DENY_DOMAINS,
        monthlyUsage: {
          searchesThisMonth: usageAgg._count._all,
          jobsThisMonth: jobsCount,
          tokensIn: usageAgg._sum.tokensIn ?? 0,
          tokensOut: usageAgg._sum.tokensOut ?? 0,
          estimatedCostUsd: Number((usageAgg._sum.costUsd ?? 0).toFixed(4)),
          activeCacheEntries: cacheCount,
        },
        reports: reports.map((r) => ({
          id: r.id,
          recommendationId: r.recommendationId,
          title: r.recommendation?.title ?? 'Unknown',
          recStatus: r.recommendation?.status ?? 'active',
          url: r.url,
          sourceDomain: r.sourceDomain,
          reason: r.reason,
          status: r.status,
          reporterEmail: r.user?.email ?? null,
          createdAt: r.createdAt,
        })),
      });
    }),
  );

  router.patch(
    '/recommendations/settings',
    superAdminOnly,
    requireStepUp,
    validate({ body: updateRecommendationSettingsSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof updateRecommendationSettingsSchema>;
      const updated = await prisma.appSettings.upsert({
        where: { id: 'global' },
        create: {
          id: 'global',
          updatedById: req.user!.id,
          ...(body.featureCourseRecommendations !== undefined
            ? { featureCourseRecommendations: body.featureCourseRecommendations }
            : {}),
          ...(body.dailyCourseSearchLimit !== undefined
            ? { dailyCourseSearchLimit: body.dailyCourseSearchLimit }
            : {}),
          ...(body.monthlySearchCostCapUsd !== undefined
            ? { monthlySearchCostCapUsd: body.monthlySearchCostCapUsd }
            : {}),
          ...(body.allowDomains !== undefined
            ? { recommendationAllowDomainsJson: body.allowDomains }
            : {}),
          ...(body.blockDomains !== undefined
            ? { recommendationBlockDomainsJson: body.blockDomains }
            : {}),
        },
        update: {
          updatedById: req.user!.id,
          ...(body.featureCourseRecommendations !== undefined
            ? { featureCourseRecommendations: body.featureCourseRecommendations }
            : {}),
          ...(body.dailyCourseSearchLimit !== undefined
            ? { dailyCourseSearchLimit: body.dailyCourseSearchLimit }
            : {}),
          ...(body.monthlySearchCostCapUsd !== undefined
            ? { monthlySearchCostCapUsd: body.monthlySearchCostCapUsd }
            : {}),
          ...(body.allowDomains !== undefined
            ? { recommendationAllowDomainsJson: body.allowDomains }
            : {}),
          ...(body.blockDomains !== undefined
            ? { recommendationBlockDomainsJson: body.blockDomains }
            : {}),
        },
      });
      await recordAuditLog(prisma, {
        actorId: req.user!.id,
        action: 'recommendations.settings_updated',
        targetType: 'app_settings',
        targetId: 'global',
        ip: req.ip,
        metadata: body,
      });
      res.json({
        featureCourseRecommendations: updated.featureCourseRecommendations,
        dailyCourseSearchLimit: updated.dailyCourseSearchLimit,
        monthlySearchCostCapUsd: updated.monthlySearchCostCapUsd,
        allowDomains: updated.recommendationAllowDomainsJson,
        blockDomains: updated.recommendationBlockDomainsJson,
      });
    }),
  );

  router.post(
    '/recommendations/reports/:id/resolve',
    requirePermission('can_moderate_content'),
    validate({ body: resolveRecommendationReportSchema }),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'Report not found');
      const { action } = req.body as z.infer<typeof resolveRecommendationReportSchema>;
      const report = await prisma.recommendationReport.findUnique({ where: { id: id.data } });
      if (!report) throw new AppError('NOT_FOUND', 'Report not found');

      if (action === 'mark_dead' || action === 'block_domain') {
        await prisma.courseRecommendation.updateMany({
          where: { id: report.recommendationId },
          data: { status: 'dead' },
        });
      }

      if (action === 'block_domain') {
        const settings = await prisma.appSettings.findUnique({ where: { id: 'global' } });
        const existing = Array.isArray(settings?.recommendationBlockDomainsJson)
          ? (settings!.recommendationBlockDomainsJson as string[])
          : [];
        const next = Array.from(new Set([...existing, report.sourceDomain.toLowerCase()]));
        await prisma.appSettings.upsert({
          where: { id: 'global' },
          create: { id: 'global', updatedById: req.user!.id, recommendationBlockDomainsJson: next },
          update: { updatedById: req.user!.id, recommendationBlockDomainsJson: next },
        });
      }

      const updated = await prisma.recommendationReport.update({
        where: { id: report.id },
        data: { status: action === 'dismiss' ? 'dismissed' : 'resolved' },
      });
      await recordAuditLog(prisma, {
        actorId: req.user!.id,
        action: 'recommendations.report_resolved',
        targetType: 'recommendation_report',
        targetId: report.id,
        ip: req.ip,
        metadata: { action, domain: report.sourceDomain },
      });
      res.json({ report: updated });
    }),
  );

  router.get(
    '/community/overview',
    requirePermission('can_moderate_content'),
    asyncHandler(async (_req, res) => {
      const [
        settings,
        totalPosts,
        totalReplies,
        activeGroups,
        openReports,
        reports,
        flaggedPosts,
        communities,
      ] = await Promise.all([
        prisma.appSettings.findUnique({ where: { id: 'global' } }).catch(() => null),
        prisma.communityPost.count({ where: { hidden: false } }),
        prisma.communityReply.count({ where: { hidden: false } }),
        prisma.studyGroup.count(),
        prisma.communityReport.count({ where: { status: 'open' } }),
        prisma.communityReport.findMany({
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            reporter: { select: { id: true, name: true, email: true } },
            targetUser: { select: { id: true, name: true, email: true, status: true } },
          },
        }),
        prisma.communityPost.findMany({
          where: { flaggedByFilter: true, hidden: false },
          orderBy: { createdAt: 'desc' },
          take: 25,
          include: {
            author: { select: { id: true, name: true, email: true } },
            community: { select: { id: true, displayName: true } },
          },
        }),
        prisma.community.findMany({
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, slug: true, displayName: true, universityName: true, isPaused: true },
        }),
      ]);

      res.json({
        stats: {
          totalPosts,
          totalReplies,
          activeGroups,
          openReports,
        },
        settings: {
          featureCommunity: settings?.featureCommunity ?? true,
          bannedWords: Array.isArray(settings?.communityBannedWordsJson)
            ? settings.communityBannedWordsJson
            : [],
          examNoticeEnabled: settings?.communityExamNoticeEnabled ?? false,
          examNoticeMessage:
            settings?.communityExamNoticeMessage ??
            'Exam period notice: remember academic integrity rules—no cheating or sharing live exam answers.',
          pausedCourseSlugs: Array.isArray(settings?.communityPausedCourseSlugsJson)
            ? settings.communityPausedCourseSlugsJson
            : [],
        },
        reports,
        flaggedPosts,
        communities,
      });
    }),
  );

  router.post(
    '/community/reports/:id/resolve',
    requirePermission('can_moderate_content'),
    validate({ body: resolveCommunityReportSchema }),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'Report not found');
      const { action, reviewNote, muteHours } = req.body as z.infer<
        typeof resolveCommunityReportSchema
      >;
      const report = await prisma.communityReport.findUnique({ where: { id: id.data } });
      if (!report) throw new AppError('NOT_FOUND', 'Report not found');

      if (action === 'hide' || action === 'delete') {
        if (report.targetType === 'post') {
          await prisma.communityPost.updateMany({
            where: { id: report.targetId },
            data: { hidden: true },
          });
        } else if (report.targetType === 'reply') {
          await prisma.communityReply.updateMany({
            where: { id: report.targetId },
            data: { hidden: true },
          });
        } else if (report.targetType === 'message') {
          await prisma.studyGroupMessage.updateMany({
            where: { id: report.targetId },
            data: { hidden: true },
          });
        } else if (report.targetType === 'resource') {
          await prisma.sharedResource.updateMany({
            where: { id: report.targetId },
            data: { hidden: true },
          });
        }
      }

      if (action === 'mute' && report.targetUserId) {
        const until = new Date(Date.now() + muteHours * 60 * 60 * 1000);
        await prisma.userCommunityProfile.upsert({
          where: { userId: report.targetUserId },
          create: { userId: report.targetUserId, mutedUntil: until },
          update: { mutedUntil: until },
        });
      } else if (action === 'suspend' && report.targetUserId) {
        await prisma.user.update({
          where: { id: report.targetUserId },
          data: {
            status: 'suspended',
            suspendedAt: new Date(),
            suspendedReason: reviewNote ?? 'Suspended via community moderation',
          },
        });
      }

      const updated = await prisma.communityReport.update({
        where: { id: report.id },
        data: {
          status: action === 'dismiss' ? 'dismissed' : 'resolved',
          reviewNote: reviewNote ?? null,
          reviewedById: req.user!.id,
        },
      });

      await Promise.all([
        prisma.moderationAction.create({
          data: {
            actorId: req.user!.id,
            targetUserId: report.targetUserId,
            targetType: report.targetType,
            targetId: report.targetId,
            action,
            reason: reviewNote ?? report.reason,
          },
        }),
        recordAuditLog(prisma, {
          actorId: req.user!.id,
          action: `community.report_${action}`,
          targetType: 'community_report',
          targetId: report.id,
          ip: req.ip,
          metadata: { targetType: report.targetType, targetId: report.targetId },
        }),
      ]);

      res.json({ report: updated });
    }),
  );

  router.patch(
    '/community/settings',
    superAdminOnly,
    requireStepUp,
    validate({ body: updateCommunitySettingsSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof updateCommunitySettingsSchema>;
      const updated = await prisma.appSettings.upsert({
        where: { id: 'global' },
        create: {
          id: 'global',
          updatedById: req.user!.id,
          ...(body.featureCommunity !== undefined
            ? { featureCommunity: body.featureCommunity }
            : {}),
          ...(body.bannedWords !== undefined ? { communityBannedWordsJson: body.bannedWords } : {}),
          ...(body.examNoticeEnabled !== undefined
            ? { communityExamNoticeEnabled: body.examNoticeEnabled }
            : {}),
          ...(body.examNoticeMessage !== undefined
            ? { communityExamNoticeMessage: body.examNoticeMessage }
            : {}),
          ...(body.pausedCourseSlugs !== undefined
            ? { communityPausedCourseSlugsJson: body.pausedCourseSlugs }
            : {}),
        },
        update: {
          updatedById: req.user!.id,
          ...(body.featureCommunity !== undefined
            ? { featureCommunity: body.featureCommunity }
            : {}),
          ...(body.bannedWords !== undefined ? { communityBannedWordsJson: body.bannedWords } : {}),
          ...(body.examNoticeEnabled !== undefined
            ? { communityExamNoticeEnabled: body.examNoticeEnabled }
            : {}),
          ...(body.examNoticeMessage !== undefined
            ? { communityExamNoticeMessage: body.examNoticeMessage }
            : {}),
          ...(body.pausedCourseSlugs !== undefined
            ? { communityPausedCourseSlugsJson: body.pausedCourseSlugs }
            : {}),
        },
      });
      await recordAuditLog(prisma, {
        actorId: req.user!.id,
        action: 'community.settings_updated',
        targetType: 'app_settings',
        targetId: 'global',
        ip: req.ip,
        metadata: body,
      });
      res.json({
        featureCommunity: updated.featureCommunity,
        bannedWords: updated.communityBannedWordsJson,
        examNoticeEnabled: updated.communityExamNoticeEnabled,
        examNoticeMessage: updated.communityExamNoticeMessage,
        pausedCourseSlugs: updated.communityPausedCourseSlugsJson,
      });
    }),
  );

  router.post(
    '/community/moderators',
    requirePermission('can_manage_users'),
    validate({ body: setCommunityRoleSchema }),
    asyncHandler(async (req, res) => {
      const { communityId, userId, role } = req.body as z.infer<typeof setCommunityRoleSchema>;
      await prisma.communityMember.upsert({
        where: { communityId_userId: { communityId, userId } },
        create: { communityId, userId, role },
        update: { role },
      });
      await Promise.all([
        prisma.moderationAction.create({
          data: {
            communityId,
            actorId: req.user!.id,
            targetUserId: userId,
            targetType: 'user',
            targetId: userId,
            action: `set_role_${role}`,
          },
        }),
        recordAuditLog(prisma, {
          actorId: req.user!.id,
          action: 'community.moderator_role_updated',
          targetType: 'community_member',
          targetId: userId,
          ip: req.ip,
          metadata: { communityId, role },
        }),
      ]);
      res.json({ ok: true, role });
    }),
  );

  return router;
}

/** Student-facing endpoints for announcements, feedback submission, and flagging messages. */
export function studentEngagementRouter(admin: AdminService, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);

  router.get(
    '/announcements/active',
    auth,
    asyncHandler(async (req, res) => {
      const data = await admin.getActiveAnnouncementsForUser(req.user!.id);
      res.json(data);
    }),
  );

  router.post(
    '/feedback',
    auth,
    validate({ body: studentFeedbackSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof studentFeedbackSchema>;
      const feedback = await admin.submitStudentFeedback(req.user!.id, body);
      res.status(201).json({ feedback });
    }),
  );

  router.post(
    '/ai/messages/:id/flag',
    auth,
    validate({ body: studentFlagMessageSchema }),
    asyncHandler(async (req, res) => {
      const id = uuidParamSchema.safeParse(req.params.id);
      if (!id.success) throw new AppError('NOT_FOUND', 'Message not found');
      const body = req.body as z.infer<typeof studentFlagMessageSchema>;
      const flag = await admin.submitStudentFlag(req.user!.id, id.data, body.reason);
      res.status(201).json({ flag });
    }),
  );

  router.post(
    '/auth/admin-invite/accept',
    validate({ body: acceptAdminInviteSchema }),
    asyncHandler(async (req, res) => {
      const body = req.body as z.infer<typeof acceptAdminInviteSchema>;
      const result = await admin.acceptAdminInvite(body, req.ip);
      res.json(result);
    }),
  );

  return router;
}
