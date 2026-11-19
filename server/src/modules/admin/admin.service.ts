import { randomInt } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Prisma, PrismaClient, UserRole, UserStatus } from '@prisma/client';
import type { Logger } from 'pino';
import type { Env } from '../../config/env';
import type { EmailService } from '../../lib/email';
import { AppError } from '../../lib/errors';
import type { LLMProvider } from '../../lib/llm/provider';
import type { StorageService } from '../../lib/storage';
import {
  ADMIN_2FA_TTL_MS,
  generateOpaqueToken,
  hashToken,
  RESET_PASSWORD_TTL_MS,
  VERIFY_EMAIL_TTL_MS,
} from '../../lib/tokens';
import { hashPassword, verifyPassword } from '../../lib/password';
import { buildPdfBuffer } from '../documents/documents.export';
import { computeStreaks, localDateString } from '../users/stats';
import {
  collectUserStorageAssets,
  deleteCollectedUserStorageAssets,
  scrubDeletedUserLoginHistory,
} from '../users/userCleanup';
import { getAppSettings, invalidateAppSettingsCache, recordAuditLog } from './admin.logging';
import type {
  acceptAdminInviteSchema,
  bulkUsersSchema,
  createAnnouncementSchema,
  createExportSchema,
  inviteAdminSchema,
  listUsersQuerySchema,
  overviewQuerySchema,
  paginationQuerySchema,
  resolveFlagSchema,
  stepUpVerifySchema,
  studentFeedbackSchema,
  updateAiLimitsSchema,
  updateAnnouncementSchema,
  updateAppSettingsSchema,
  updateFeedbackSchema,
  updatePlatformSettingsSchema,
} from './admin.schemas';
import type { z } from 'zod';

function parseDateRange(query: z.infer<typeof overviewQuerySchema>): { from: Date; to: Date } {
  const to = query.to ? new Date(query.to) : new Date();
  if (Number.isNaN(to.getTime())) {
    throw new AppError('VALIDATION_ERROR', 'Invalid "to" date');
  }
  let from: Date;
  if (query.range === 'custom' && query.from) {
    from = new Date(query.from);
    if (Number.isNaN(from.getTime())) {
      throw new AppError('VALIDATION_ERROR', 'Invalid "from" date');
    }
  } else {
    const days = query.range === '7d' ? 7 : query.range === '90d' ? 90 : 30;
    from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  }
  return { from, to };
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function csvEscape(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  // Neutralize spreadsheet formula injection (=, +, -, @, tab, CR) even after leading whitespace.
  const s = /^[\s\t\r]*[=+\-@]/.test(raw) || /^[\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface AdminServiceDeps {
  prisma: PrismaClient;
  env: Env;
  email: EmailService;
  storage: StorageService;
  llm?: LLMProvider;
  logger: Logger;
}

export function createAdminService(deps: AdminServiceDeps) {
  const { prisma, env, email, storage, llm, logger } = deps;
  const overviewCache = new Map<string, { data: unknown; expiresAt: number }>();

  return {
    async getOverview(query: z.infer<typeof overviewQuerySchema>) {
      const cacheKey = `${query.range}:${query.from ?? ''}:${query.to ?? ''}`;
      const cached = overviewCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.data;
      }

      const { from, to } = parseDateRange(query);
      const now = new Date();
      const startToday = new Date(now);
      startToday.setUTCHours(0, 0, 0, 0);
      const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const d1 = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const [
        totalUsers,
        newToday,
        new7d,
        new30d,
        verifiedUsers,
        unverifiedUsers,
        dau,
        wau,
        mau,
        totalAiMessages,
        totalChatAttachments,
        totalDocumentsProcessed,
        totalNotes,
        totalQuizzesTaken,
        recentSignups,
        recentErrors,
        usersInRange,
        messagesInRange,
        attachmentsInRange,
        documentsInRange,
        activityInRange,
        usageByFeature,
        topCoursesRaw,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { createdAt: { gte: startToday } } }),
        prisma.user.count({ where: { createdAt: { gte: d7 } } }),
        prisma.user.count({ where: { createdAt: { gte: d30 } } }),
        prisma.user.count({ where: { emailVerified: true } }),
        prisma.user.count({ where: { emailVerified: false } }),
        prisma.user.count({ where: { lastActiveAt: { gte: d1 } } }),
        prisma.user.count({ where: { lastActiveAt: { gte: d7 } } }),
        prisma.user.count({ where: { lastActiveAt: { gte: d30 } } }),
        prisma.message.count(),
        prisma.messageAttachment.count(),
        prisma.document.count({ where: { status: 'ready' } }),
        prisma.note.count(),
        prisma.quizAttempt.count(),
        prisma.user.findMany({
          take: 8,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            status: true,
            emailVerified: true,
            createdAt: true,
          },
        }),
        prisma.errorLog.findMany({
          take: 8,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            route: true,
            method: true,
            statusCode: true,
            code: true,
            message: true,
            createdAt: true,
          },
        }),
        prisma.user.findMany({
          where: { createdAt: { gte: from, lte: to } },
          select: { createdAt: true },
        }),
        prisma.message.findMany({
          where: { createdAt: { gte: from, lte: to } },
          select: { createdAt: true },
        }),
        prisma.messageAttachment.findMany({
          where: { createdAt: { gte: from, lte: to } },
          select: { createdAt: true },
        }),
        prisma.document.findMany({
          where: { createdAt: { gte: from, lte: to } },
          select: { createdAt: true },
        }),
        prisma.activityEvent.findMany({
          where: { createdAt: { gte: from, lte: to } },
          select: { userId: true, createdAt: true },
        }),
        prisma.usageEvent.groupBy({
          by: ['feature'],
          where: { createdAt: { gte: from, lte: to } },
          _count: { _all: true },
        }),
        prisma.course.findMany({
          take: 6,
          select: {
            id: true,
            name: true,
            _count: { select: { notes: true, tasks: true, documents: true } },
          },
        }),
      ]);

      // Build daily buckets
      const buckets = new Map<
        string,
        { date: string; signups: number; dauSet: Set<string>; aiMessages: number; uploads: number }
      >();
      const cursor = new Date(from);
      cursor.setUTCHours(0, 0, 0, 0);
      const end = new Date(to);
      end.setUTCHours(0, 0, 0, 0);
      while (cursor <= end) {
        const key = dayKey(cursor);
        buckets.set(key, { date: key, signups: 0, dauSet: new Set(), aiMessages: 0, uploads: 0 });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      for (const u of usersInRange) {
        const b = buckets.get(dayKey(u.createdAt));
        if (b) b.signups += 1;
      }
      for (const m of messagesInRange) {
        const b = buckets.get(dayKey(m.createdAt));
        if (b) b.aiMessages += 1;
      }
      for (const a of attachmentsInRange) {
        const b = buckets.get(dayKey(a.createdAt));
        if (b) b.uploads += 1;
      }
      for (const d of documentsInRange) {
        const b = buckets.get(dayKey(d.createdAt));
        if (b) b.uploads += 1;
      }
      for (const act of activityInRange) {
        const b = buckets.get(dayKey(act.createdAt));
        if (b) b.dauSet.add(act.userId);
      }

      const series = Array.from(buckets.values()).map((b) => ({
        date: b.date,
        signups: b.signups,
        dau: b.dauSet.size,
        aiMessages: b.aiMessages,
        uploads: b.uploads,
      }));

      let dbHealthy = true;
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        dbHealthy = false;
      }

      const data = {
        stats: {
          totalUsers,
          newToday,
          new7d,
          new30d,
          dau,
          wau,
          mau,
          verifiedUsers,
          unverifiedUsers,
          totalAiMessages,
          totalUploads: totalChatAttachments + documentsInRange.length,
          totalNotes,
          totalQuizzesTaken,
          totalDocumentsProcessed,
        },
        series,
        topFeatures: usageByFeature.map((u) => ({ feature: u.feature, count: u._count._all })),
        topCourses: topCoursesRaw
          .map((c) => ({
            id: c.id,
            name: c.name,
            activityCount: c._count.notes + c._count.tasks + c._count.documents,
          }))
          .sort((a, b) => b.activityCount - a.activityCount),
        recentSignups,
        recentErrors,
        systemHealth: {
          api: 'up',
          database: dbHealthy ? 'up' : 'down',
          email: env.RESEND_API_KEY || env.SMTP_URL ? 'configured' : 'unconfigured',
          ai: llm?.isConfigured() ? 'configured' : 'unconfigured',
          storage: storage.isConfigured() ? 'configured' : 'unconfigured',
        },
      };

      overviewCache.set(cacheKey, { data, expiresAt: Date.now() + 30_000 });
      return data;
    },

    async listUsers(query: z.infer<typeof listUsersQuerySchema>) {
      const where: Prisma.UserWhereInput = {};
      if (query.q) {
        where.OR = [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
          { programme: { contains: query.q, mode: 'insensitive' } },
        ];
      }
      if (query.role) where.role = query.role;
      if (query.status) where.status = query.status;
      if (query.verified) where.emailVerified = query.verified === 'true';
      if (query.authMethod === 'google') {
        where.identities = { some: { provider: 'google' } };
      } else if (query.authMethod === 'email') {
        where.passwordHash = { not: null };
      }
      if (query.from || query.to) {
        where.createdAt = {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        };
      }

      const [total, rows] = await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          orderBy: { [query.sortBy]: query.sortDir },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            emailVerified: true,
            programme: true,
            level: true,
            university: true,
            passwordHash: true,
            createdAt: true,
            lastActiveAt: true,
            identities: { select: { provider: true } },
          },
        }),
      ]);

      return {
        total,
        page: query.page,
        pageSize: query.pageSize,
        items: rows.map((u) => ({
          id: u.id,
          email: u.email,
          name: u.name,
          role: u.role,
          status: u.status,
          emailVerified: u.emailVerified,
          programme: u.programme,
          level: u.level,
          university: u.university,
          authMethod: u.identities.some((i) => i.provider === 'google') ? 'google' : 'email',
          createdAt: u.createdAt,
          lastActiveAt: u.lastActiveAt,
        })),
      };
    },

    async getUserDetail(userId: string) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          suspendedAt: true,
          suspendedReason: true,
          twoFactorEnabled: true,
          emailVerified: true,
          studentId: true,
          programme: true,
          level: true,
          university: true,
          bio: true,
          avatarUrl: true,
          createdAt: true,
          lastActiveAt: true,
          identities: { select: { provider: true, createdAt: true } },
          settings: { select: { timezone: true } },
        },
      });
      if (!user) throw new AppError('NOT_FOUND', 'User not found');

      const [
        aiMessages,
        chatUploads,
        documentsCount,
        notesCount,
        quizzesTaken,
        studySessions,
        recentActivity,
        recentLogins,
      ] = await Promise.all([
        prisma.message.count({ where: { userId } }),
        prisma.messageAttachment.count({ where: { userId } }),
        prisma.document.count({ where: { userId } }),
        prisma.note.count({ where: { userId } }),
        prisma.quizAttempt.count({ where: { userId } }),
        prisma.studySession.findMany({
          where: { userId },
          select: { startedAt: true, durationSeconds: true },
        }),
        prisma.activityEvent.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 25,
        }),
        prisma.loginHistory.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 15,
        }),
      ]);

      const totalSeconds = studySessions.reduce((acc, s) => acc + s.durationSeconds, 0);
      const tz = user.settings?.timezone ?? 'UTC';
      const activeDayKeys = new Set(studySessions.map((s) => localDateString(s.startedAt, tz)));
      const { streakDays: streak } = computeStreaks(activeDayKeys, tz);

      return {
        user: {
          ...user,
          authMethod: user.identities.some((i) => i.provider === 'google') ? 'google' : 'email',
        },
        stats: {
          aiMessages,
          uploads: chatUploads + documentsCount,
          notes: notesCount,
          quizzesTaken,
          studyHours: Number((totalSeconds / 3600).toFixed(1)),
          streak,
        },
        recentActivity,
        recentLogins,
      };
    },

    async setUserStatus(
      actorId: string,
      targetUserId: string,
      status: UserStatus,
      reason: string | undefined,
      ip: string | undefined,
    ) {
      if (actorId === targetUserId) {
        throw new AppError('VALIDATION_ERROR', 'You cannot suspend your own account');
      }
      const [actor, target] = await Promise.all([
        prisma.user.findUnique({ where: { id: actorId }, select: { role: true } }),
        prisma.user.findUnique({ where: { id: targetUserId } }),
      ]);
      if (!target) throw new AppError('NOT_FOUND', 'User not found');
      if (
        (target.role === 'admin' || target.role === 'super_admin') &&
        actor?.role !== 'super_admin'
      ) {
        throw new AppError(
          'FORBIDDEN',
          'Only a super_admin can suspend or reactivate admin accounts',
        );
      }

      const updated = await prisma.user.update({
        where: { id: targetUserId },
        data: {
          status,
          suspendedAt: status === 'suspended' ? new Date() : null,
          suspendedReason: status === 'suspended' ? reason?.trim() || 'Suspended by admin' : null,
        },
        select: { id: true, email: true, status: true, suspendedAt: true, suspendedReason: true },
      });

      if (status === 'suspended') {
        await prisma.refreshToken.updateMany({
          where: { userId: targetUserId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await recordAuditLog(prisma, {
        actorId,
        action: status === 'suspended' ? 'user.suspend' : 'user.reactivate',
        targetType: 'user',
        targetId: targetUserId,
        reason: reason ?? null,
        ip,
      });

      return updated;
    },

    async forceLogout(actorId: string, targetUserId: string, ip: string | undefined) {
      const [actor, target] = await Promise.all([
        prisma.user.findUnique({ where: { id: actorId }, select: { role: true } }),
        prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, role: true } }),
      ]);
      if (!target) throw new AppError('NOT_FOUND', 'User not found');
      if (
        actorId !== targetUserId &&
        (target.role === 'admin' || target.role === 'super_admin') &&
        actor?.role !== 'super_admin'
      ) {
        throw new AppError('FORBIDDEN', 'Only a super_admin can force-logout another admin');
      }
      await prisma.refreshToken.updateMany({
        where: { userId: targetUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await recordAuditLog(prisma, {
        actorId,
        action: 'user.force_logout',
        targetType: 'user',
        targetId: targetUserId,
        ip,
      });
    },

    async resendVerification(actorId: string, targetUserId: string, ip: string | undefined) {
      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, email: true, name: true, emailVerified: true },
      });
      if (!user) throw new AppError('NOT_FOUND', 'User not found');
      const { raw, hash } = generateOpaqueToken();
      const current = new Date();
      await prisma.$transaction([
        prisma.emailToken.updateMany({
          where: { userId: user.id, type: 'verify_email', usedAt: null },
          data: { usedAt: current },
        }),
        prisma.emailToken.create({
          data: {
            userId: user.id,
            type: 'verify_email',
            tokenHash: hash,
            expiresAt: new Date(current.getTime() + VERIFY_EMAIL_TTL_MS),
          },
        }),
      ]);
      const url = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(raw)}`;
      await email.sendVerificationEmail(user.email, user.name, url).catch((err) => {
        logger.warn({ err, userId: user.id }, 'Admin resendVerification email failed');
      });
      await recordAuditLog(prisma, {
        actorId,
        action: 'user.resend_verification',
        targetType: 'user',
        targetId: user.id,
        ip,
      });
    },

    async triggerPasswordReset(actorId: string, targetUserId: string, ip: string | undefined) {
      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, email: true, name: true },
      });
      if (!user) throw new AppError('NOT_FOUND', 'User not found');
      const { raw, hash } = generateOpaqueToken();
      const current = new Date();
      await prisma.$transaction([
        prisma.emailToken.updateMany({
          where: { userId: user.id, type: 'reset_password', usedAt: null },
          data: { usedAt: current },
        }),
        prisma.emailToken.create({
          data: {
            userId: user.id,
            type: 'reset_password',
            tokenHash: hash,
            expiresAt: new Date(current.getTime() + RESET_PASSWORD_TTL_MS),
          },
        }),
      ]);
      const url = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(raw)}`;
      await email.sendPasswordResetEmail(user.email, user.name, url).catch((err) => {
        logger.warn({ err, userId: user.id }, 'Admin triggerPasswordReset email failed');
      });
      await recordAuditLog(prisma, {
        actorId,
        action: 'user.trigger_password_reset',
        targetType: 'user',
        targetId: user.id,
        ip,
      });
    },

    async setUserRole(
      actorId: string,
      targetUserId: string,
      role: UserRole,
      reason: string | undefined,
      ip: string | undefined,
    ) {
      if (actorId === targetUserId) {
        throw new AppError('VALIDATION_ERROR', 'You cannot change your own role');
      }
      const target = await prisma.user.findUnique({ where: { id: targetUserId } });
      if (!target) throw new AppError('NOT_FOUND', 'User not found');

      if (target.role === 'super_admin' && role !== 'super_admin') {
        const superCount = await prisma.user.count({ where: { role: 'super_admin' } });
        if (superCount <= 1) {
          throw new AppError('VALIDATION_ERROR', 'Cannot demote the last remaining super_admin');
        }
      }

      const updated = await prisma.user.update({
        where: { id: targetUserId },
        data: { role },
        select: { id: true, email: true, role: true },
      });
      await recordAuditLog(prisma, {
        actorId,
        action: 'user.change_role',
        targetType: 'user',
        targetId: targetUserId,
        reason: reason ?? null,
        before: { role: target.role },
        after: { role },
        metadata: { previousRole: target.role, newRole: role },
        ip,
      });
      return updated;
    },

    async deleteUser(actorId: string, targetUserId: string, ip: string | undefined) {
      if (actorId === targetUserId) {
        throw new AppError('VALIDATION_ERROR', 'You cannot delete your own account from admin');
      }
      const [actor, target] = await Promise.all([
        prisma.user.findUnique({ where: { id: actorId }, select: { role: true } }),
        prisma.user.findUnique({
          where: { id: targetUserId },
          select: { id: true, email: true, role: true, avatarPublicId: true },
        }),
      ]);
      if (!target) throw new AppError('NOT_FOUND', 'User not found');
      if (
        (target.role === 'admin' || target.role === 'super_admin') &&
        actor?.role !== 'super_admin'
      ) {
        throw new AppError('FORBIDDEN', 'Only a super_admin can delete admin accounts');
      }
      if (target.role === 'super_admin') {
        const superCount = await prisma.user.count({ where: { role: 'super_admin' } });
        if (superCount <= 1) {
          throw new AppError('VALIDATION_ERROR', 'Cannot delete the last remaining super_admin');
        }
      }

      const assets = await collectUserStorageAssets(prisma, targetUserId, target.avatarPublicId);
      await prisma.user.delete({ where: { id: targetUserId } });
      await scrubDeletedUserLoginHistory(prisma, logger, targetUserId, target.email);
      await deleteCollectedUserStorageAssets(storage, logger, targetUserId, assets);
      await recordAuditLog(prisma, {
        actorId,
        action: 'user.delete',
        targetType: 'user',
        targetId: targetUserId,
        before: { email: target.email, role: target.role },
        metadata: { email: target.email },
        ip,
      });
    },

    async bulkUsers(
      actorId: string,
      input: z.infer<typeof bulkUsersSchema>,
      ip: string | undefined,
    ) {
      if (input.action === 'suspend') {
        const actor = await prisma.user.findUnique({
          where: { id: actorId },
          select: { role: true },
        });
        const ids = input.userIds.filter((id) => id !== actorId);
        if (ids.length > 0 && actor?.role !== 'super_admin') {
          const targets = await prisma.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, role: true },
          });
          if (targets.some((t) => t.role === 'admin' || t.role === 'super_admin')) {
            throw new AppError('FORBIDDEN', 'Only super_admin can suspend admin accounts');
          }
        }
        const current = new Date();
        await prisma.user.updateMany({
          where: { id: { in: ids } },
          data: {
            status: 'suspended',
            suspendedAt: current,
            suspendedReason: input.reason?.trim() || 'Bulk suspended by admin',
            tokensValidAfter: current,
          },
        });
        await prisma.refreshToken.updateMany({
          where: { userId: { in: ids }, revokedAt: null },
          data: { revokedAt: current },
        });
        await recordAuditLog(prisma, {
          actorId,
          action: 'user.bulk_suspend',
          targetType: 'user',
          reason: input.reason ?? null,
          metadata: { count: ids.length, userIds: ids },
          ip,
        });
        return { updated: ids.length };
      }

      const rows = await prisma.user.findMany({
        where: { id: { in: input.userIds } },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          emailVerified: true,
          programme: true,
          level: true,
          createdAt: true,
          lastActiveAt: true,
        },
      });
      const header =
        'id,email,name,role,status,emailVerified,programme,level,createdAt,lastActiveAt';
      const lines = rows.map((r) =>
        [
          r.id,
          r.email,
          r.name,
          r.role,
          r.status,
          r.emailVerified,
          r.programme ?? '',
          r.level ?? '',
          r.createdAt.toISOString(),
          r.lastActiveAt?.toISOString() ?? '',
        ]
          .map(csvEscape)
          .join(','),
      );
      await recordAuditLog(prisma, {
        actorId,
        action: 'user.bulk_export_csv',
        targetType: 'user',
        metadata: { count: rows.length },
        ip,
      });
      return { csv: [header, ...lines].join('\n') };
    },

    async getAiUsage(query: z.infer<typeof overviewQuerySchema>) {
      const { from, to } = parseDateRange(query);
      const now = new Date();
      const startToday = new Date(now);
      startToday.setUTCHours(0, 0, 0, 0);
      const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

      const [
        settings,
        aggRange,
        aggToday,
        aggMonth,
        errorCount,
        byFeature,
        topUsersRaw,
        eventsInRange,
      ] = await Promise.all([
        getAppSettings(prisma),
        prisma.usageEvent.aggregate({
          where: { createdAt: { gte: from, lte: to } },
          _count: { _all: true },
          _sum: { tokensIn: true, tokensOut: true, costUsd: true },
          _avg: { durationMs: true },
        }),
        prisma.usageEvent.aggregate({
          where: { createdAt: { gte: startToday } },
          _sum: { costUsd: true, tokensIn: true, tokensOut: true },
          _count: { _all: true },
        }),
        prisma.usageEvent.aggregate({
          where: { createdAt: { gte: startMonth } },
          _sum: { costUsd: true },
        }),
        prisma.usageEvent.count({
          where: { createdAt: { gte: from, lte: to }, status: 'error' },
        }),
        prisma.usageEvent.groupBy({
          by: ['feature'],
          where: { createdAt: { gte: from, lte: to } },
          _count: { _all: true },
          _sum: { tokensIn: true, tokensOut: true, costUsd: true },
        }),
        prisma.usageEvent.groupBy({
          by: ['userId'],
          where: { createdAt: { gte: from, lte: to }, userId: { not: null } },
          _count: { _all: true },
          _sum: { tokensIn: true, tokensOut: true, costUsd: true },
          orderBy: { _sum: { costUsd: 'desc' } },
          take: 10,
        }),
        prisma.usageEvent.findMany({
          where: { createdAt: { gte: from, lte: to } },
          select: { createdAt: true, costUsd: true, tokensIn: true, tokensOut: true },
        }),
      ]);

      const topUserIds = topUsersRaw.map((t) => t.userId).filter((id): id is string => Boolean(id));
      const userRows =
        topUserIds.length > 0
          ? await prisma.user.findMany({
              where: { id: { in: topUserIds } },
              select: { id: true, name: true, email: true },
            })
          : [];
      const userMap = new Map(userRows.map((u) => [u.id, u]));

      const dailyMap = new Map<
        string,
        { date: string; requests: number; costUsd: number; tokens: number }
      >();
      for (const ev of eventsInRange) {
        const key = dayKey(ev.createdAt);
        const cur = dailyMap.get(key) ?? { date: key, requests: 0, costUsd: 0, tokens: 0 };
        cur.requests += 1;
        cur.costUsd = Number((cur.costUsd + ev.costUsd).toFixed(6));
        cur.tokens += ev.tokensIn + ev.tokensOut;
        dailyMap.set(key, cur);
      }

      const totalRequests = aggRange._count._all;
      const costTodayUsd = Number((aggToday._sum.costUsd ?? 0).toFixed(4));
      return {
        summary: {
          totalRequests,
          tokensIn: aggRange._sum.tokensIn ?? 0,
          tokensOut: aggRange._sum.tokensOut ?? 0,
          costRangeUsd: Number((aggRange._sum.costUsd ?? 0).toFixed(4)),
          costTodayUsd,
          costMonthUsd: Number((aggMonth._sum.costUsd ?? 0).toFixed(4)),
          avgDurationMs: Math.round(aggRange._avg.durationMs ?? 0),
          errorRatePct:
            totalRequests > 0 ? Number(((errorCount / totalRequests) * 100).toFixed(2)) : 0,
          alertTriggered: costTodayUsd >= settings.dailyCostAlertUsd,
        },
        limits: {
          dailyMessageLimit: settings.dailyMessageLimit,
          maxUploadBytes: settings.maxUploadBytes,
          dailyUploadQuota: settings.dailyUploadQuota,
          dailyCostAlertUsd: settings.dailyCostAlertUsd,
        },
        byFeature: byFeature.map((f) => ({
          feature: f.feature,
          requests: f._count._all,
          tokensIn: f._sum.tokensIn ?? 0,
          tokensOut: f._sum.tokensOut ?? 0,
          costUsd: Number((f._sum.costUsd ?? 0).toFixed(4)),
        })),
        daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
        topUsers: topUsersRaw.map((t) => {
          const u = t.userId ? userMap.get(t.userId) : undefined;
          return {
            userId: t.userId,
            name: u?.name ?? 'Unknown',
            email: u?.email ?? '',
            requests: t._count._all,
            tokens: (t._sum.tokensIn ?? 0) + (t._sum.tokensOut ?? 0),
            costUsd: Number((t._sum.costUsd ?? 0).toFixed(4)),
          };
        }),
      };
    },

    async updateAiLimits(
      actorId: string,
      input: z.infer<typeof updateAiLimitsSchema>,
      ip: string | undefined,
    ) {
      await getAppSettings(prisma);
      const updated = await prisma.appSettings.update({
        where: { id: 'global' },
        data: { ...input, updatedById: actorId },
      });
      invalidateAppSettingsCache();
      await recordAuditLog(prisma, {
        actorId,
        action: 'settings.update_limits',
        targetType: 'app_settings',
        targetId: 'global',
        metadata: input,
        ip,
      });
      return updated;
    },

    async listConversationsMeta(query: z.infer<typeof paginationQuerySchema>) {
      const where: Prisma.ConversationWhereInput = query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { user: { email: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {};
      const [total, rows] = await Promise.all([
        prisma.conversation.count({ where }),
        prisma.conversation.findMany({
          where,
          orderBy: { updatedAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
            user: { select: { id: true, name: true, email: true } },
            _count: { select: { messages: true, attachments: true } },
          },
        }),
      ]);
      return { total, page: query.page, pageSize: query.pageSize, items: rows };
    },

    async inspectConversation(
      actorId: string,
      conversationId: string,
      reason: string,
      ip: string | undefined,
    ) {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          user: { select: { id: true, name: true, email: true } },
          messages: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              role: true,
              content: true,
              status: true,
              createdAt: true,
            },
          },
        },
      });
      if (!conv) throw new AppError('NOT_FOUND', 'Conversation not found');

      await recordAuditLog(prisma, {
        actorId,
        action: 'moderation.inspect_conversation',
        targetType: 'conversation',
        targetId: conversationId,
        reason,
        metadata: { targetUserId: conv.userId },
        ip,
      });

      return conv;
    },

    async listUploads(query: z.infer<typeof paginationQuerySchema>) {
      const [attCount, docCount, attSum, docSum, attachments, documents] = await Promise.all([
        prisma.messageAttachment.count(),
        prisma.document.count(),
        prisma.messageAttachment.aggregate({ _sum: { sizeBytes: true } }),
        prisma.document.aggregate({ _sum: { sizeBytes: true } }),
        prisma.messageAttachment.findMany({
          orderBy: { createdAt: 'desc' },
          take: query.pageSize,
          skip: (query.page - 1) * query.pageSize,
          select: {
            id: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        }),
        prisma.document.findMany({
          orderBy: { createdAt: 'desc' },
          take: query.pageSize,
          skip: (query.page - 1) * query.pageSize,
          select: {
            id: true,
            title: true,
            originalName: true,
            mimeType: true,
            sizeBytes: true,
            status: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        }),
      ]);

      const items = [
        ...attachments.map((a) => ({
          id: a.id,
          source: 'attachment' as const,
          name: a.originalName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          status: 'ready',
          owner: a.user,
          createdAt: a.createdAt,
        })),
        ...documents.map((d) => ({
          id: d.id,
          source: 'document' as const,
          name: d.title || d.originalName,
          mimeType: d.mimeType,
          sizeBytes: d.sizeBytes,
          status: d.status,
          owner: d.user,
          createdAt: d.createdAt,
        })),
      ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return {
        total: attCount + docCount,
        totalStorageBytes: (attSum._sum.sizeBytes ?? 0) + (docSum._sum.sizeBytes ?? 0),
        items,
      };
    },

    async inspectUpload(
      actorId: string,
      source: 'attachment' | 'document',
      id: string,
      reason: string,
      ip: string | undefined,
    ) {
      if (source === 'attachment') {
        const item = await prisma.messageAttachment.findUnique({ where: { id } });
        if (!item) throw new AppError('NOT_FOUND', 'Attachment not found');
        await recordAuditLog(prisma, {
          actorId,
          action: 'moderation.inspect_upload',
          targetType: 'attachment',
          targetId: id,
          reason,
          ip,
        });
        return {
          id: item.id,
          name: item.originalName,
          mimeType: item.mimeType,
          extractedText: item.extractedText,
          signedUrl: storage.getSignedAttachmentUrl(item.storageKey, item.kind),
        };
      }

      const doc = await prisma.document.findUnique({ where: { id } });
      if (!doc) throw new AppError('NOT_FOUND', 'Document not found');
      await recordAuditLog(prisma, {
        actorId,
        action: 'moderation.inspect_upload',
        targetType: 'document',
        targetId: id,
        reason,
        ip,
      });
      return {
        id: doc.id,
        name: doc.title,
        mimeType: doc.mimeType,
        extractedText: doc.extractedText.slice(0, 8000),
        signedUrl: storage.getSignedAttachmentUrl(doc.storageKey, doc.kind),
      };
    },

    async deleteUpload(
      actorId: string,
      source: 'attachment' | 'document',
      id: string,
      ip: string | undefined,
    ) {
      if (source === 'attachment') {
        const item = await prisma.messageAttachment.findUnique({ where: { id } });
        if (!item) throw new AppError('NOT_FOUND', 'Attachment not found');
        await storage.deleteAttachment(item.storageKey, item.kind).catch(() => undefined);
        await prisma.messageAttachment.delete({ where: { id } });
      } else {
        const doc = await prisma.document.findUnique({ where: { id } });
        if (!doc) throw new AppError('NOT_FOUND', 'Document not found');
        await storage.deleteAttachment(doc.storageKey, doc.kind).catch(() => undefined);
        await prisma.document.delete({ where: { id } });
      }
      await recordAuditLog(prisma, {
        actorId,
        action: 'moderation.delete_upload',
        targetType: source,
        targetId: id,
        ip,
      });
    },

    async listFlaggedContent(query: z.infer<typeof paginationQuerySchema>) {
      const where: Prisma.FlaggedContentWhereInput = query.status
        ? { status: query.status as 'open' | 'dismissed' | 'warned' | 'suspended' }
        : {};
      const [total, items] = await Promise.all([
        prisma.flaggedContent.count({ where }),
        prisma.flaggedContent.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: {
            targetUser: { select: { id: true, name: true, email: true, status: true } },
            reporter: { select: { id: true, name: true, email: true } },
          },
        }),
      ]);
      return { total, page: query.page, pageSize: query.pageSize, items };
    },

    async resolveFlaggedContent(
      actorId: string,
      flagId: string,
      input: z.infer<typeof resolveFlagSchema>,
      ip: string | undefined,
    ) {
      const flag = await prisma.flaggedContent.findUnique({ where: { id: flagId } });
      if (!flag) throw new AppError('NOT_FOUND', 'Flagged item not found');

      const updated = await prisma.flaggedContent.update({
        where: { id: flagId },
        data: {
          status: input.status,
          reviewedById: actorId,
          reviewNote: input.reviewNote ?? null,
        },
      });

      if (input.status === 'warned') {
        await prisma.notification.create({
          data: {
            userId: flag.targetUserId,
            type: 'system',
            title: 'Account moderation warning',
            body:
              input.reviewNote ||
              'Your recent activity was flagged for violating LearnSpace guidelines.',
          },
        });
      } else if (input.status === 'suspended' && flag.targetUserId !== actorId) {
        await prisma.user.update({
          where: { id: flag.targetUserId },
          data: {
            status: 'suspended',
            suspendedAt: new Date(),
            suspendedReason: input.reviewNote || 'Suspended following moderation review',
          },
        });
        await prisma.refreshToken.updateMany({
          where: { userId: flag.targetUserId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await recordAuditLog(prisma, {
        actorId,
        action: `moderation.flag_${input.status}`,
        targetType: 'flagged_content',
        targetId: flagId,
        reason: input.reviewNote ?? null,
        ip,
      });
      return updated;
    },

    async getLearningStats() {
      const [
        totalQuizzes,
        totalQuizAttempts,
        quizAttemptsSample,
        totalDecks,
        totalCards,
        totalNotes,
        totalTasks,
        completedTasks,
        studySessionsSum,
        topCoursesRaw,
        byProgramme,
        byLevel,
        totalCourses,
        totalTimetableEntries,
        totalExams,
        totalRevisionPlans,
        totalFlashcardReviews,
        totalDocuments,
        totalPracticeAttempts,
        totalGradingScales,
        totalGradeRecords,
      ] = await Promise.all([
        prisma.quiz.count(),
        prisma.quizAttempt.count(),
        prisma.quizAttempt.findMany({ select: { score: true, total: true }, take: 2000 }),
        prisma.deck.count(),
        prisma.card.count(),
        prisma.note.count(),
        prisma.task.count(),
        prisma.task.count({ where: { status: 'done' } }),
        prisma.studySession.aggregate({ _sum: { durationSeconds: true } }),
        prisma.course.findMany({
          take: 10,
          select: {
            id: true,
            name: true,
            _count: { select: { notes: true, tasks: true, documents: true } },
          },
        }),
        prisma.user.groupBy({
          by: ['programme'],
          _count: { _all: true },
        }),
        prisma.user.groupBy({
          by: ['level'],
          _count: { _all: true },
        }),
        prisma.course?.count ? prisma.course.count() : Promise.resolve(0),
        prisma.timetableEntry?.count ? prisma.timetableEntry.count() : Promise.resolve(0),
        prisma.exam?.count ? prisma.exam.count() : Promise.resolve(0),
        prisma.revisionPlan?.count ? prisma.revisionPlan.count() : Promise.resolve(0),
        prisma.reviewLog?.count ? prisma.reviewLog.count() : Promise.resolve(0),
        prisma.document?.count ? prisma.document.count() : Promise.resolve(0),
        prisma.documentPracticeAttempt?.count
          ? prisma.documentPracticeAttempt.count()
          : Promise.resolve(0),
        prisma.gradingScale?.count ? prisma.gradingScale.count() : Promise.resolve(0),
        prisma.gradeRecord?.count ? prisma.gradeRecord.count() : Promise.resolve(0),
      ]);

      const avgQuizScorePct =
        quizAttemptsSample.length > 0
          ? Number(
              (
                (quizAttemptsSample.reduce(
                  (acc, a) => acc + (a.total > 0 ? a.score / a.total : 0),
                  0,
                ) /
                  quizAttemptsSample.length) *
                100
              ).toFixed(1),
            )
          : 0;

      return {
        totals: {
          totalQuizzes,
          totalQuizAttempts,
          avgQuizScorePct,
          totalDecks,
          totalCards,
          totalNotes,
          totalTasks,
          completedTasks,
          taskCompletionRatePct:
            totalTasks > 0 ? Number(((completedTasks / totalTasks) * 100).toFixed(1)) : 0,
          totalStudyHours: Number(
            (((studySessionsSum._sum.durationSeconds ?? 0) as number) / 3600).toFixed(1),
          ),
          totalCourses,
          totalTimetableEntries,
          totalExams,
          totalRevisionPlans,
          totalFlashcardReviews,
          totalDocuments,
          totalPracticeAttempts,
          totalGradingScales,
          totalGradeRecords,
        },
        popularCourses: topCoursesRaw
          .map((c) => ({
            id: c.id,
            name: c.name,
            notes: c._count.notes,
            tasks: c._count.tasks,
            documents: c._count.documents,
            total: c._count.notes + c._count.tasks + c._count.documents,
          }))
          .sort((a, b) => b.total - a.total),
        programmeBreakdown: byProgramme.map((p) => ({
          label: p.programme || 'Unspecified',
          count: p._count._all,
        })),
        levelBreakdown: byLevel.map((l) => ({
          label: l.level || 'Unspecified',
          count: l._count._all,
        })),
      };
    },

    // ---------------------------------------------------------------- Announcements
    async listAnnouncements() {
      return prisma.announcement.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { author: { select: { id: true, name: true, email: true } } },
      });
    },

    async createAnnouncement(
      actorId: string,
      input: z.infer<typeof createAnnouncementSchema>,
      ip: string | undefined,
    ) {
      const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
      const isImmediate = !scheduledAt || scheduledAt <= new Date();
      const item = await prisma.announcement.create({
        data: {
          authorId: actorId,
          title: input.title,
          message: input.message,
          audience: input.audience,
          audienceValue: input.audienceValue ?? null,
          scheduledAt,
          publishedAt: isImmediate ? new Date() : null,
          sendEmail: input.sendEmail,
          active: true,
        },
      });

      if (isImmediate) {
        const userWhere: Prisma.UserWhereInput = { status: 'active' };
        if (input.audience === 'programme' && input.audienceValue) {
          userWhere.programme = { equals: input.audienceValue, mode: 'insensitive' };
        } else if (input.audience === 'level' && input.audienceValue) {
          userWhere.level = { equals: input.audienceValue, mode: 'insensitive' };
        }
        const recipients = await prisma.user.findMany({
          where: userWhere,
          select: { id: true, email: true, name: true, emailVerified: true },
          take: 250,
        });
        if (recipients.length > 0) {
          await prisma.notification.createMany({
            data: recipients.map((u) => ({
              userId: u.id,
              type: 'system',
              title: input.title,
              body: input.message,
            })),
          });
          if (input.sendEmail) {
            for (const u of recipients.filter((r) => r.emailVerified).slice(0, 50)) {
              void email
                .sendVerificationEmail(u.email, u.name, `${input.title}: ${input.message}`)
                .catch(() => undefined);
            }
          }
        }
      }

      await recordAuditLog(prisma, {
        actorId,
        action: 'announcement.create',
        targetType: 'announcement',
        targetId: item.id,
        metadata: { audience: input.audience, sendEmail: input.sendEmail },
        ip,
      });
      return item;
    },

    async updateAnnouncement(
      actorId: string,
      id: string,
      input: z.infer<typeof updateAnnouncementSchema>,
      ip: string | undefined,
    ) {
      const existing = await prisma.announcement.findUnique({ where: { id } });
      if (!existing) throw new AppError('NOT_FOUND', 'Announcement not found');
      const updated = await prisma.announcement.update({
        where: { id },
        data: input,
      });
      await recordAuditLog(prisma, {
        actorId,
        action: 'announcement.update',
        targetType: 'announcement',
        targetId: id,
        metadata: input,
        ip,
      });
      return updated;
    },

    async deleteAnnouncement(actorId: string, id: string, ip: string | undefined) {
      const existing = await prisma.announcement.findUnique({ where: { id } });
      if (!existing) throw new AppError('NOT_FOUND', 'Announcement not found');
      await prisma.announcement.delete({ where: { id } });
      await recordAuditLog(prisma, {
        actorId,
        action: 'announcement.delete',
        targetType: 'announcement',
        targetId: id,
        ip,
      });
    },

    async getActiveAnnouncementsForUser(userId: string) {
      const [user, settings, announcements] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { programme: true, level: true },
        }),
        getAppSettings(prisma),
        prisma.announcement.findMany({
          where: {
            active: true,
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      ]);

      const matching = announcements.filter((a) => {
        if (a.audience === 'all') return true;
        if (a.audience === 'programme' && a.audienceValue) {
          return (user?.programme ?? '').toLowerCase() === a.audienceValue.toLowerCase();
        }
        if (a.audience === 'level' && a.audienceValue) {
          return (user?.level ?? '').toLowerCase() === a.audienceValue.toLowerCase();
        }
        return false;
      });

      return {
        maintenanceMode: settings.maintenanceMode,
        maintenanceMessage: settings.maintenanceMessage,
        features: {
          chat: settings.featureChat,
          uploads: settings.featureUploads,
          documents: settings.featureDocuments,
        },
        announcements: matching,
      };
    },

    // ---------------------------------------------------------------- Feedback & Moderation
    async submitStudentFeedback(userId: string, input: z.infer<typeof studentFeedbackSchema>) {
      return prisma.feedbackReport.create({
        data: {
          userId,
          category: input.category,
          subject: input.subject,
          message: input.message,
        },
      });
    },

    async submitStudentFlag(userId: string, messageId: string, reason: string) {
      const msg = await prisma.message.findFirst({
        where: { id: messageId, userId },
        select: { id: true, conversationId: true, userId: true },
      });
      if (!msg) throw new AppError('NOT_FOUND', 'Message not found');
      return prisma.flaggedContent.create({
        data: {
          reporterId: userId,
          targetUserId: msg.userId,
          conversationId: msg.conversationId,
          messageId: msg.id,
          reason,
        },
      });
    },

    async listFeedback(query: z.infer<typeof paginationQuerySchema>) {
      const where: Prisma.FeedbackReportWhereInput = query.status
        ? { status: query.status as 'new' | 'in_progress' | 'resolved' }
        : {};
      const [total, items] = await Promise.all([
        prisma.feedbackReport.count({ where }),
        prisma.feedbackReport.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: { user: { select: { id: true, name: true, email: true } } },
        }),
      ]);
      return { total, page: query.page, pageSize: query.pageSize, items };
    },

    async updateFeedback(
      actorId: string,
      id: string,
      input: z.infer<typeof updateFeedbackSchema>,
      ip: string | undefined,
    ) {
      const existing = await prisma.feedbackReport.findUnique({ where: { id } });
      if (!existing) throw new AppError('NOT_FOUND', 'Feedback report not found');
      const updated = await prisma.feedbackReport.update({
        where: { id },
        data: {
          status: input.status,
          ...(input.adminNotes !== undefined ? { adminNotes: input.adminNotes } : {}),
        },
      });
      await recordAuditLog(prisma, {
        actorId,
        action: 'feedback.update',
        targetType: 'feedback_report',
        targetId: id,
        metadata: input,
        ip,
      });
      return updated;
    },

    async replyFeedback(actorId: string, id: string, message: string, ip: string | undefined) {
      const report = await prisma.feedbackReport.findUnique({
        where: { id },
        include: { user: { select: { id: true, email: true, name: true } } },
      });
      if (!report) throw new AppError('NOT_FOUND', 'Feedback report not found');

      await email
        .sendVerificationEmail(
          report.user.email,
          report.user.name,
          `Re: ${report.subject} — ${message}`,
        )
        .catch((err) => logger.warn({ err, feedbackId: id }, 'Feedback reply email failed'));

      await prisma.notification.create({
        data: {
          userId: report.user.id,
          type: 'system',
          title: `Reply to your feedback: ${report.subject}`,
          body: message,
        },
      });

      const updated = await prisma.feedbackReport.update({
        where: { id },
        data: { status: 'resolved', repliedAt: new Date() },
      });
      await recordAuditLog(prisma, {
        actorId,
        action: 'feedback.reply',
        targetType: 'feedback_report',
        targetId: id,
        ip,
      });
      return updated;
    },

    // ---------------------------------------------------------------- Audit, Logs, Health, Settings
    async listAuditLogs(query: z.infer<typeof paginationQuerySchema>) {
      const where: Prisma.AuditLogWhereInput = {};
      if (query.action) where.action = { contains: query.action, mode: 'insensitive' };
      if (query.q) {
        where.OR = [
          { action: { contains: query.q, mode: 'insensitive' } },
          { targetType: { contains: query.q, mode: 'insensitive' } },
          { reason: { contains: query.q, mode: 'insensitive' } },
          { actor: { email: { contains: query.q, mode: 'insensitive' } } },
        ];
      }

      if (query.format === 'csv') {
        const rows = await prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 2000,
          include: { actor: { select: { email: true } } },
        });
        const header = 'id,actorEmail,action,targetType,targetId,reason,ip,createdAt';
        const lines = rows.map((r) =>
          [
            r.id,
            r.actor?.email ?? 'deleted-admin',
            r.action,
            r.targetType,
            r.targetId ?? '',
            r.reason ?? '',
            r.ip ?? '',
            r.createdAt.toISOString(),
          ]
            .map(csvEscape)
            .join(','),
        );
        return { csv: [header, ...lines].join('\n') };
      }

      const [total, items] = await Promise.all([
        prisma.auditLog.count({ where }),
        prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          include: { actor: { select: { id: true, name: true, email: true } } },
        }),
      ]);
      return { total, page: query.page, pageSize: query.pageSize, items };
    },

    async listLoginHistory(query: z.infer<typeof paginationQuerySchema>) {
      const where: Prisma.LoginHistoryWhereInput = {};
      if (query.suspicious === 'true') where.suspicious = true;
      if (query.q) where.email = { contains: query.q, mode: 'insensitive' };
      const [total, items] = await Promise.all([
        prisma.loginHistory.count({ where }),
        prisma.loginHistory.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return { total, page: query.page, pageSize: query.pageSize, items };
    },

    async listErrorLogs(query: z.infer<typeof paginationQuerySchema>) {
      const [total, items] = await Promise.all([
        prisma.errorLog.count(),
        prisma.errorLog.findMany({
          orderBy: { createdAt: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return { total, page: query.page, pageSize: query.pageSize, items };
    },

    async getSystemHealth() {
      let dbStatus: 'up' | 'down' = 'up';
      const dbStart = Date.now();
      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch {
        dbStatus = 'down';
      }
      const dbLatencyMs = Date.now() - dbStart;

      return {
        version: '0.1.0',
        nodeVersion: process.version,
        uptimeSeconds: Math.round(process.uptime()),
        api: 'up',
        database: dbStatus,
        dbLatencyMs,
        email: env.RESEND_API_KEY || env.SMTP_URL ? 'configured' : 'unconfigured',
        ai: llm?.isConfigured() ? 'configured' : 'unconfigured',
        storage: storage.isConfigured() ? 'configured' : 'unconfigured',
      };
    },

    async getSettings() {
      return getAppSettings(prisma);
    },

    async updateSettings(
      actorId: string,
      input: z.infer<typeof updateAppSettingsSchema>,
      ip: string | undefined,
    ) {
      await getAppSettings(prisma);
      const { allowedFileTypesJson, ...rest } = input;
      const updated = await prisma.appSettings.update({
        where: { id: 'global' },
        data: {
          ...rest,
          ...(allowedFileTypesJson !== undefined
            ? { allowedFileTypesJson: allowedFileTypesJson as unknown as Prisma.InputJsonValue }
            : {}),
          updatedById: actorId,
        },
      });
      invalidateAppSettingsCache();
      await recordAuditLog(prisma, {
        actorId,
        action: 'settings.update',
        targetType: 'app_settings',
        targetId: 'global',
        metadata: input,
        ip,
      });
      return updated;
    },

    // ---------------------------------------------------------------- Exports & Reports
    async createExportJob(
      actorId: string,
      input: z.infer<typeof createExportSchema>,
      ip: string | undefined,
    ) {
      const exportDir = path.join(os.tmpdir(), 'learnspace-admin-exports');
      await fs.mkdir(exportDir, { recursive: true });
      const ext = input.kind === 'overview_pdf' ? 'pdf' : 'csv';
      const fileName = `learnspace_${input.kind}_${Date.now()}.${ext}`;
      const filePath = path.join(exportDir, fileName);

      const job = await prisma.adminExportJob.create({
        data: {
          adminId: actorId,
          kind: input.kind,
          filtersJson: { from: input.from ?? null, to: input.to ?? null },
          status: 'running',
          filePath,
          fileName,
        },
      });

      const dateWhere =
        input.from || input.to
          ? {
              gte: input.from ? new Date(input.from) : undefined,
              lte: input.to ? new Date(input.to) : undefined,
            }
          : undefined;

      try {
        if (input.kind === 'users') {
          const rows = await prisma.user.findMany({
            where: dateWhere ? { createdAt: dateWhere } : undefined,
            orderBy: { createdAt: 'desc' },
            take: 10_000,
          });
          const header = 'id,email,name,role,status,emailVerified,programme,level,createdAt';
          const lines = rows.map((r) =>
            [
              r.id,
              r.email,
              r.name,
              r.role,
              r.status,
              r.emailVerified,
              r.programme ?? '',
              r.level ?? '',
              r.createdAt.toISOString(),
            ]
              .map(csvEscape)
              .join(','),
          );
          await fs.writeFile(filePath, [header, ...lines].join('\n'), 'utf8');
        } else if (input.kind === 'usage' || input.kind === 'ai_costs') {
          const rows = await prisma.usageEvent.findMany({
            where: dateWhere ? { createdAt: dateWhere } : undefined,
            orderBy: { createdAt: 'desc' },
            take: 10_000,
          });
          const header =
            'id,userId,feature,model,tokensIn,tokensOut,costUsd,durationMs,status,createdAt';
          const lines = rows.map((r) =>
            [
              r.id,
              r.userId ?? '',
              r.feature,
              r.model ?? '',
              r.tokensIn,
              r.tokensOut,
              r.costUsd,
              r.durationMs,
              r.status,
              r.createdAt.toISOString(),
            ]
              .map(csvEscape)
              .join(','),
          );
          await fs.writeFile(filePath, [header, ...lines].join('\n'), 'utf8');
        } else if (input.kind === 'feedback') {
          const rows = await prisma.feedbackReport.findMany({
            where: dateWhere ? { createdAt: dateWhere } : undefined,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { email: true } } },
            take: 10_000,
          });
          const header = 'id,userEmail,category,subject,status,message,createdAt';
          const lines = rows.map((r) =>
            [
              r.id,
              r.user.email,
              r.category,
              r.subject,
              r.status,
              r.message,
              r.createdAt.toISOString(),
            ]
              .map(csvEscape)
              .join(','),
          );
          await fs.writeFile(filePath, [header, ...lines].join('\n'), 'utf8');
        } else {
          const overview = (await this.getOverview({ range: '30d' })) as {
            stats: Record<string, number>;
          };
          const pdfBuf = await buildPdfBuffer({
            title: 'LearnSpace Admin Overview Report',
            subtitle: `Generated ${new Date().toISOString()}`,
            sections: [
              {
                heading: 'Platform KPIs',
                prompt: 'Database-verified platform metrics',
                body: Object.entries(overview.stats)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join('\n'),
              },
            ],
          });
          await fs.writeFile(filePath, pdfBuf);
        }

        const completed = await prisma.adminExportJob.update({
          where: { id: job.id },
          data: { status: 'completed', finishedAt: new Date() },
        });
        await recordAuditLog(prisma, {
          actorId,
          action: 'report.export',
          targetType: 'admin_export_job',
          targetId: job.id,
          metadata: { kind: input.kind },
          ip,
        });
        return completed;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Export failed';
        await prisma.adminExportJob.update({
          where: { id: job.id },
          data: { status: 'failed', error: message, finishedAt: new Date() },
        });
        throw err;
      }
    },

    async listExportJobs(adminId: string) {
      return prisma.adminExportJob.findMany({
        where: { adminId },
        orderBy: { createdAt: 'desc' },
        take: 25,
      });
    },

    async downloadExportJob(adminId: string, jobId: string) {
      const job = await prisma.adminExportJob.findFirst({
        where: { id: jobId, adminId },
      });
      if (!job || job.status !== 'completed' || !job.filePath || !job.fileName) {
        throw new AppError('NOT_FOUND', 'Export file not available');
      }
      const bytes = await fs.readFile(job.filePath);
      return {
        bytes,
        fileName: job.fileName,
        mimeType: job.fileName.endsWith('.pdf') ? 'application/pdf' : 'text/csv; charset=utf-8',
      };
    },

    // ---------------------------------------------------------------- Super Admin Controls
    async requestStepUpOtp(actorId: string) {
      const user = await prisma.user.findUnique({
        where: { id: actorId },
        select: { id: true, email: true, name: true },
      });
      if (!user) throw new AppError('NOT_FOUND', 'User not found');

      const code = String(randomInt(100000, 1000000));
      const now = new Date();
      await prisma.$transaction([
        prisma.emailToken.updateMany({
          where: { userId: user.id, type: 'super_step_up', usedAt: null },
          data: { usedAt: now },
        }),
        prisma.emailToken.create({
          data: {
            userId: user.id,
            type: 'super_step_up',
            tokenHash: hashToken(code),
            expiresAt: new Date(now.getTime() + ADMIN_2FA_TTL_MS),
          },
        }),
      ]);
      await email
        .sendTaskReminderEmail(
          user.email,
          user.name,
          `Your LearnSpace Super Admin verification code is: ${code} (expires in 10 minutes)`,
          `${env.CLIENT_URL}/admin`,
        )
        .catch((err) => {
          logger.warn({ err, userId: user.id }, 'Failed to send super_step_up OTP email');
        });
      return { sent: true };
    },

    async verifyStepUp(actorId: string, input: z.infer<typeof stepUpVerifySchema>) {
      const user = await prisma.user.findUnique({
        where: { id: actorId },
        select: { id: true, passwordHash: true },
      });
      if (!user) throw new AppError('NOT_FOUND', 'User not found');

      if (input.password) {
        if (user.passwordHash) {
          const ok = await verifyPassword(user.passwordHash, input.password);
          if (ok) return { verified: true };
        }
        throw new AppError('FORBIDDEN', 'Incorrect password for step-up verification');
      }

      if (input.code) {
        const now = new Date();
        const token = await prisma.emailToken.findFirst({
          where: {
            userId: actorId,
            type: 'super_step_up',
            tokenHash: hashToken(input.code),
            usedAt: null,
            expiresAt: { gt: now },
          },
        });
        if (!token) throw new AppError('FORBIDDEN', 'Invalid or expired step-up OTP');
        await prisma.emailToken.update({ where: { id: token.id }, data: { usedAt: now } });
        return { verified: true };
      }

      throw new AppError('VALIDATION_ERROR', 'Provide your password or a 6-digit OTP code');
    },

    async listAdminTeam() {
      const admins = await prisma.user.findMany({
        where: { role: { in: ['admin', 'super_admin'] } },
        orderBy: [{ role: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          status: true,
          emailVerified: true,
          twoFactorEnabled: true,
          adminPermissionsJson: true,
          lastActiveAt: true,
          createdAt: true,
        },
      });

      const ids = admins.map((a) => a.id);
      const [recentLogins, actionCounts] = ids.length
        ? await Promise.all([
            prisma.loginHistory.findMany({
              where: { userId: { in: ids }, success: true },
              orderBy: { createdAt: 'desc' },
              take: 200,
              select: { userId: true, ip: true, createdAt: true },
            }),
            prisma.auditLog.groupBy({
              by: ['actorId'],
              where: { actorId: { in: ids } },
              _count: { _all: true },
            }),
          ])
        : [[], []];

      const actionCountByUser = new Map<string, number>();
      for (const row of actionCounts) {
        if (row.actorId) {
          actionCountByUser.set(row.actorId, row._count._all);
        }
      }

      const lastLoginByUser = new Map<string, { ip: string | null; at: Date }>();
      for (const row of recentLogins) {
        if (row.userId && !lastLoginByUser.has(row.userId)) {
          lastLoginByUser.set(row.userId, { ip: row.ip, at: row.createdAt });
        }
      }

      const invites = await prisma.adminInvite.findMany({
        where: { acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
      });

      return {
        members: admins.map((a) => {
          const login = lastLoginByUser.get(a.id);
          return {
            id: a.id,
            name: a.name,
            email: a.email,
            role: a.role,
            status: a.status,
            emailVerified: a.emailVerified,
            twoFactorEnabled: a.twoFactorEnabled,
            permissions: a.adminPermissionsJson as Record<string, boolean>,
            actionsCount: actionCountByUser.get(a.id) ?? 0,
            lastLoginAt: login?.at ?? a.lastActiveAt,
            lastLoginIp: login?.ip ?? null,
            createdAt: a.createdAt,
          };
        }),
        invites: invites.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role: inv.role,
          permissions: inv.permissionsJson as Record<string, boolean>,
          expiresAt: inv.expiresAt,
          createdAt: inv.createdAt,
        })),
      };
    },

    async inviteAdmin(
      actorId: string,
      input: z.infer<typeof inviteAdminSchema>,
      ip: string | undefined,
      userAgent: string | undefined,
    ) {
      const normalizedEmail = input.email.toLowerCase();
      const { raw, hash } = generateOpaqueToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const permissions = {
        can_manage_users: true,
        can_moderate_content: true,
        can_view_ai_usage: true,
        can_send_announcements: true,
        can_export_data: true,
        ...(input.permissions ?? {}),
      };

      const invite = await prisma.adminInvite.create({
        data: {
          email: normalizedEmail,
          role: input.role,
          permissionsJson: permissions as Prisma.InputJsonValue,
          tokenHash: hash,
          invitedById: actorId,
          expiresAt,
        },
      });

      const acceptUrl = `${env.CLIENT_URL}/accept-admin-invite?token=${encodeURIComponent(raw)}`;
      await email
        .sendTaskReminderEmail(
          normalizedEmail,
          normalizedEmail,
          `You have been invited as ${input.role} on LearnSpace. Accept within 24 hours:`,
          acceptUrl,
        )
        .catch((err) => {
          logger.warn({ err, email: normalizedEmail }, 'Admin invite email failed');
        });

      await recordAuditLog(prisma, {
        actorId,
        action: 'super.admin_invited',
        targetType: 'admin_invite',
        targetId: invite.id,
        after: { email: normalizedEmail, role: input.role, permissions },
        ip,
        userAgent,
      });

      return { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt };
    },

    async revokeAdminInvite(
      actorId: string,
      inviteId: string,
      ip: string | undefined,
      userAgent: string | undefined,
    ) {
      const existing = await prisma.adminInvite.findUnique({ where: { id: inviteId } });
      if (!existing) throw new AppError('NOT_FOUND', 'Invite not found');
      await prisma.adminInvite.delete({ where: { id: inviteId } });
      await recordAuditLog(prisma, {
        actorId,
        action: 'super.invite_revoked',
        targetType: 'admin_invite',
        targetId: inviteId,
        before: { email: existing.email, role: existing.role },
        ip,
        userAgent,
      });
    },

    async acceptAdminInvite(
      input: z.infer<typeof acceptAdminInviteSchema>,
      ip: string | undefined,
    ) {
      const now = new Date();
      const invite = await prisma.adminInvite.findUnique({
        where: { tokenHash: hashToken(input.token) },
      });
      if (!invite || invite.acceptedAt || invite.expiresAt <= now) {
        throw new AppError('VALIDATION_ERROR', 'This admin invite link is invalid or expired');
      }

      const passwordHash = await hashPassword(input.password);
      const existingUser = await prisma.user.findUnique({ where: { email: invite.email } });
      let userId: string;

      if (existingUser) {
        const updated = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            passwordHash,
            role: invite.role,
            status: 'active',
            emailVerified: true,
            adminPermissionsJson: invite.permissionsJson as Prisma.InputJsonValue,
            ...(input.name ? { name: input.name } : {}),
          },
          select: { id: true },
        });
        userId = updated.id;
      } else {
        const created = await prisma.user.create({
          data: {
            email: invite.email,
            name: input.name || invite.email.split('@')[0] || 'Admin',
            passwordHash,
            role: invite.role,
            status: 'active',
            emailVerified: true,
            adminPermissionsJson: invite.permissionsJson as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        userId = created.id;
      }

      await prisma.adminInvite.update({ where: { id: invite.id }, data: { acceptedAt: now } });
      await recordAuditLog(prisma, {
        actorId: userId,
        action: 'super.admin_invite_accepted',
        targetType: 'user',
        targetId: userId,
        after: { email: invite.email, role: invite.role },
        ip,
      });
      return { email: invite.email, role: invite.role };
    },

    async updateAdminPermissions(
      actorId: string,
      targetUserId: string,
      permissions: Record<string, boolean | undefined>,
      reason: string | undefined,
      ip: string | undefined,
      userAgent: string | undefined,
    ) {
      if (actorId === targetUserId) {
        throw new AppError('VALIDATION_ERROR', 'You cannot edit your own permissions');
      }
      const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, role: true, adminPermissionsJson: true },
      });
      if (!target) throw new AppError('NOT_FOUND', 'Admin user not found');
      if (target.role !== 'admin' && target.role !== 'super_admin') {
        throw new AppError('VALIDATION_ERROR', 'Target user is not an admin');
      }

      const prev =
        target.adminPermissionsJson && typeof target.adminPermissionsJson === 'object'
          ? (target.adminPermissionsJson as Record<string, boolean>)
          : {};
      const next = { ...prev, ...permissions };

      const updated = await prisma.user.update({
        where: { id: targetUserId },
        data: { adminPermissionsJson: next as Prisma.InputJsonValue },
        select: { id: true, email: true, role: true, adminPermissionsJson: true },
      });

      await recordAuditLog(prisma, {
        actorId,
        action: 'super.permissions_updated',
        targetType: 'user',
        targetId: targetUserId,
        reason: reason ?? null,
        before: prev,
        after: next,
        ip,
        userAgent,
      });

      return updated;
    },

    async getPlatformSettings() {
      const settings = await getAppSettings(prisma);
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      const [versions, monthlySpendAgg] = await Promise.all([
        prisma.appSettingsVersion.findMany({
          orderBy: { version: 'desc' },
          take: 25,
        }),
        prisma.usageEvent.aggregate({
          where: { createdAt: { gte: monthStart } },
          _sum: { costUsd: true },
        }),
      ]);

      return {
        settings,
        versions,
        monthlyAiSpendUsd: Number((monthlySpendAgg._sum.costUsd ?? 0).toFixed(4)),
        aiApiConfigured: Boolean(env.NVIDIA_API_KEY || env.GEMINI_API_KEY),
      };
    },

    async updatePlatformSettings(
      actorId: string,
      input: z.infer<typeof updatePlatformSettingsSchema>,
      ip: string | undefined,
      userAgent: string | undefined,
    ) {
      const before = await getAppSettings(prisma);
      const { reason, allowedFileTypesJson, maintenanceAllowlistJson, ...rest } = input;
      const nextVersion = (before.currentVersion ?? 1) + 1;

      const updated = await prisma.appSettings.update({
        where: { id: 'global' },
        data: {
          ...rest,
          ...(allowedFileTypesJson !== undefined
            ? { allowedFileTypesJson: allowedFileTypesJson as unknown as Prisma.InputJsonValue }
            : {}),
          ...(maintenanceAllowlistJson !== undefined
            ? {
                maintenanceAllowlistJson:
                  maintenanceAllowlistJson as unknown as Prisma.InputJsonValue,
              }
            : {}),
          currentVersion: nextVersion,
          updatedById: actorId,
        },
      });

      await prisma.appSettingsVersion.create({
        data: {
          version: nextVersion,
          snapshotJson: updated as unknown as Prisma.InputJsonValue,
          changedById: actorId,
          reason: reason ?? null,
        },
      });

      invalidateAppSettingsCache();
      await recordAuditLog(prisma, {
        actorId,
        action: 'super.settings_updated',
        targetType: 'app_settings',
        targetId: 'global',
        reason: reason ?? null,
        before,
        after: updated,
        ip,
        userAgent,
      });

      return updated;
    },

    async rollbackPlatformSettings(
      actorId: string,
      targetVersion: number,
      reason: string,
      ip: string | undefined,
      userAgent: string | undefined,
    ) {
      const before = await getAppSettings(prisma);
      const ver = await prisma.appSettingsVersion.findFirst({
        where: { version: targetVersion },
      });
      if (!ver) throw new AppError('NOT_FOUND', 'Settings version not found');

      const snap = ver.snapshotJson as Record<string, unknown>;
      const nextVersion = (before.currentVersion ?? 1) + 1;

      const updated = await prisma.appSettings.update({
        where: { id: 'global' },
        data: {
          appName: typeof snap.appName === 'string' ? snap.appName : before.appName,
          supportEmail:
            typeof snap.supportEmail === 'string' ? snap.supportEmail : before.supportEmail,
          maintenanceMode:
            typeof snap.maintenanceMode === 'boolean'
              ? snap.maintenanceMode
              : before.maintenanceMode,
          maintenanceMessage:
            typeof snap.maintenanceMessage === 'string'
              ? snap.maintenanceMessage
              : before.maintenanceMessage,
          featureChat:
            typeof snap.featureChat === 'boolean' ? snap.featureChat : before.featureChat,
          featureUploads:
            typeof snap.featureUploads === 'boolean' ? snap.featureUploads : before.featureUploads,
          featureDocuments:
            typeof snap.featureDocuments === 'boolean'
              ? snap.featureDocuments
              : before.featureDocuments,
          featureSignups:
            typeof snap.featureSignups === 'boolean' ? snap.featureSignups : before.featureSignups,
          featureGoogleLogin:
            typeof snap.featureGoogleLogin === 'boolean'
              ? snap.featureGoogleLogin
              : before.featureGoogleLogin,
          dailyMessageLimit:
            typeof snap.dailyMessageLimit === 'number'
              ? snap.dailyMessageLimit
              : before.dailyMessageLimit,
          maxUploadBytes:
            typeof snap.maxUploadBytes === 'number' ? snap.maxUploadBytes : before.maxUploadBytes,
          dailyUploadQuota:
            typeof snap.dailyUploadQuota === 'number'
              ? snap.dailyUploadQuota
              : before.dailyUploadQuota,
          dailyCostAlertUsd:
            typeof snap.dailyCostAlertUsd === 'number'
              ? snap.dailyCostAlertUsd
              : before.dailyCostAlertUsd,
          monthlyCostCapUsd:
            typeof snap.monthlyCostCapUsd === 'number'
              ? snap.monthlyCostCapUsd
              : before.monthlyCostCapUsd,
          sessionLifetimeMinutes:
            typeof snap.sessionLifetimeMinutes === 'number'
              ? snap.sessionLifetimeMinutes
              : before.sessionLifetimeMinutes,
          minPasswordLength:
            typeof snap.minPasswordLength === 'number'
              ? snap.minPasswordLength
              : before.minPasswordLength,
          requireEmailVerification:
            typeof snap.requireEmailVerification === 'boolean'
              ? snap.requireEmailVerification
              : before.requireEmailVerification,
          requireAdminOtp:
            typeof snap.requireAdminOtp === 'boolean'
              ? snap.requireAdminOtp
              : before.requireAdminOtp,
          maxLoginAttempts:
            typeof snap.maxLoginAttempts === 'number'
              ? snap.maxLoginAttempts
              : before.maxLoginAttempts,
          lockoutMinutes:
            typeof snap.lockoutMinutes === 'number' ? snap.lockoutMinutes : before.lockoutMinutes,
          aiModel: typeof snap.aiModel === 'string' ? snap.aiModel : before.aiModel,
          aiSystemPromptVersion:
            typeof snap.aiSystemPromptVersion === 'string'
              ? snap.aiSystemPromptVersion
              : before.aiSystemPromptVersion,
          aiMaxTokens: typeof snap.aiMaxTokens === 'number' ? snap.aiMaxTokens : before.aiMaxTokens,
          ...(Array.isArray(snap.allowedFileTypesJson)
            ? { allowedFileTypesJson: snap.allowedFileTypesJson as Prisma.InputJsonValue }
            : {}),
          ...(Array.isArray(snap.maintenanceAllowlistJson)
            ? { maintenanceAllowlistJson: snap.maintenanceAllowlistJson as Prisma.InputJsonValue }
            : {}),
          currentVersion: nextVersion,
          updatedById: actorId,
        },
      });

      await prisma.appSettingsVersion.create({
        data: {
          version: nextVersion,
          snapshotJson: updated as unknown as Prisma.InputJsonValue,
          changedById: actorId,
          reason: `Rollback to v${targetVersion}: ${reason}`,
        },
      });

      invalidateAppSettingsCache();
      await recordAuditLog(prisma, {
        actorId,
        action: 'super.settings_rollback',
        targetType: 'app_settings',
        targetId: 'global',
        reason,
        before,
        after: updated,
        ip,
        userAgent,
      });

      return updated;
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;
