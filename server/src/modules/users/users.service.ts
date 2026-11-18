import { Prisma, type PrismaClient, type UserSettings } from '@prisma/client';
import type { Logger } from 'pino';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { detectImageMime, type StorageService } from '../../lib/storage';
import { hashToken } from '../../lib/tokens';
import { toPublicUser, type PublicUser } from '../auth/auth.service';
import { getUserStats, type UserStats } from './stats';
import {
  collectUserStorageAssets,
  deleteCollectedUserStorageAssets,
  scrubDeletedUserLoginHistory,
} from './userCleanup';
import type {
  AvatarConfig,
  ChangePasswordInput,
  DeleteAccountInput,
  UpdateProfileInput,
  UpdateSettingsInput,
} from './users.schemas';

export interface PublicSettings {
  theme: UserSettings['theme'];
  timezone: string;
  notifyInApp: boolean;
  notifyEmailReminders: boolean;
  notifyProductEmail: boolean;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  classReminderMinutes: number;
  examReminderMinutes: number;
}

function toPublicSettings(settings: UserSettings): PublicSettings {
  return {
    theme: settings.theme,
    timezone: settings.timezone,
    notifyInApp: settings.notifyInApp,
    notifyEmailReminders: settings.notifyEmailReminders,
    notifyProductEmail: settings.notifyProductEmail,
    focusMinutes: settings.focusMinutes,
    shortBreakMinutes: settings.shortBreakMinutes,
    longBreakMinutes: settings.longBreakMinutes,
    classReminderMinutes: settings.classReminderMinutes ?? 15,
    examReminderMinutes: settings.examReminderMinutes ?? 1440,
  };
}

export interface UsersServiceDeps {
  prisma: PrismaClient;
  storage: StorageService;
  logger: Logger;
}

export interface StoredAvatarImage {
  mimeType: string;
  data: Uint8Array;
  etag: string;
}

export interface UsersService {
  getMe(userId: string): Promise<PublicUser>;
  updateMe(userId: string, input: UpdateProfileInput): Promise<PublicUser>;
  uploadAvatar(
    userId: string,
    buffer: Buffer,
    avatarConfig?: AvatarConfig | null,
  ): Promise<{ avatarUrl: string; avatarConfig: AvatarConfig | null }>;
  getAvatarImage(userId: string): Promise<StoredAvatarImage | null>;
  deleteAvatar(userId: string): Promise<void>;
  changePassword(
    userId: string,
    input: ChangePasswordInput,
    currentRefreshToken?: string,
  ): Promise<void>;
  deleteAccount(
    userId: string,
    input: DeleteAccountInput,
    tokenIssuedAtSec?: number,
  ): Promise<void>;
  getStats(userId: string): Promise<UserStats>;
  getSettings(userId: string): Promise<PublicSettings>;
  updateSettings(userId: string, input: UpdateSettingsInput): Promise<PublicSettings>;
  exportMyData(userId: string): Promise<Record<string, unknown>>;
}

const RECENT_LOGIN_WINDOW_SEC = 10 * 60;

export function createUsersService({ prisma, storage, logger }: UsersServiceDeps): UsersService {
  return {
    async getMe(userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError('UNAUTHENTICATED');
      return toPublicUser(user);
    },

    async updateMe(userId, input) {
      const data: UpdateProfileInput = {};
      if (input.name !== undefined) data.name = input.name;
      if (input.studentId !== undefined) data.studentId = input.studentId;
      if (input.programme !== undefined) data.programme = input.programme;
      if (input.level !== undefined) data.level = input.level;
      if (input.university !== undefined) data.university = input.university;
      if (input.bio !== undefined) data.bio = input.bio;

      const user = await prisma.user.update({
        where: { id: userId },
        data,
      });
      return toPublicUser(user);
    },

    async uploadAvatar(userId, buffer, avatarConfig) {
      const mime = detectImageMime(buffer);
      if (!mime) {
        throw new AppError(
          'UNSUPPORTED_MEDIA_TYPE',
          'Avatar must be a valid JPEG, PNG, or WebP image',
        );
      }

      const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatarPublicId: true },
      });
      if (!existing) throw new AppError('UNAUTHENTICATED');

      const uploaded = await storage.uploadAvatar(buffer, userId);
      const normalizedConfig = avatarConfig ?? null;
      const previousPublicId = existing.avatarPublicId;

      await prisma.user.update({
        where: { id: userId },
        data: {
          avatarUrl: uploaded.url,
          avatarPublicId: uploaded.publicId,
          avatarConfig: normalizedConfig ?? Prisma.DbNull,
        },
      });

      if (previousPublicId && previousPublicId !== uploaded.publicId) {
        await storage.deleteAvatar(previousPublicId);
      }

      return { avatarUrl: uploaded.url, avatarConfig: normalizedConfig };
    },

    async getAvatarImage(userId) {
      return prisma.userAvatar.findUnique({
        where: { userId },
        select: { mimeType: true, data: true, etag: true },
      });
    },

    async deleteAvatar(userId) {
      const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatarPublicId: true },
      });
      if (!existing) throw new AppError('UNAUTHENTICATED');
      const previousPublicId = existing.avatarPublicId;

      await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: null, avatarPublicId: null, avatarConfig: Prisma.DbNull },
      });

      if (previousPublicId) {
        await storage.deleteAvatar(previousPublicId);
      }
    },

    async changePassword(userId, input, currentRefreshToken) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError('UNAUTHENTICATED');

      if (user.passwordHash !== null) {
        if (!input.currentPassword) {
          throw new AppError('INVALID_CREDENTIALS', 'Current password is required');
        }
        const matches = await verifyPassword(user.passwordHash, input.currentPassword);
        if (!matches) {
          throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect');
        }
      }

      const newHash = await hashPassword(input.newPassword);
      const currentTokenHash = currentRefreshToken ? hashToken(currentRefreshToken) : null;

      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: { passwordHash: newHash },
        }),
        prisma.refreshToken.updateMany({
          where: {
            userId,
            revokedAt: null,
            ...(currentTokenHash ? { tokenHash: { not: currentTokenHash } } : {}),
          },
          data: { revokedAt: new Date() },
        }),
      ]);

      logger.info({ userId }, 'User changed password');
    },

    async deleteAccount(userId, input, tokenIssuedAtSec) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError('UNAUTHENTICATED');

      if (user.passwordHash !== null) {
        if (!input.password) {
          throw new AppError('INVALID_CREDENTIALS', 'Password is required to delete your account');
        }
        const matches = await verifyPassword(user.passwordHash, input.password);
        if (!matches) {
          throw new AppError('INVALID_CREDENTIALS', 'Incorrect password');
        }
      } else {
        if (input.confirm !== 'DELETE') {
          throw new AppError('VALIDATION_ERROR', 'Type DELETE to confirm account deletion');
        }
        const nowSec = Math.floor(Date.now() / 1000);
        if (!tokenIssuedAtSec || nowSec - tokenIssuedAtSec > RECENT_LOGIN_WINDOW_SEC) {
          throw new AppError('UNAUTHENTICATED', 'Please log in again before deleting your account');
        }
      }

      const assets = await collectUserStorageAssets(prisma, userId, user.avatarPublicId);
      await prisma.user.delete({ where: { id: userId } });
      await scrubDeletedUserLoginHistory(prisma, logger, userId, user.email);
      await deleteCollectedUserStorageAssets(storage, logger, userId, assets);

      logger.info({ userId }, 'User deleted account');
    },

    async getStats(userId) {
      return getUserStats(prisma, userId);
    },

    async getSettings(userId) {
      const settings = await prisma.userSettings.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
      return toPublicSettings(settings);
    },

    async updateSettings(userId, input) {
      if (input.notifyEmailReminders === true) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { emailVerified: true },
        });
        if (!user) throw new AppError('UNAUTHENTICATED');
        if (!user.emailVerified) {
          throw new AppError(
            'EMAIL_NOT_VERIFIED',
            'Verify your email address before enabling email reminders',
          );
        }
      }

      const settings = await prisma.userSettings.upsert({
        where: { userId },
        create: { userId, ...input },
        update: input,
      });
      return toPublicSettings(settings);
    },

    async exportMyData(userId) {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError('UNAUTHENTICATED');

      const [
        settings,
        courses,
        notes,
        tasks,
        timetableEntries,
        exams,
        revisionPlans,
        decks,
        reviewLogs,
        quizzes,
        gradingScales,
        gradeRecords,
        studySessions,
        notifications,
        conversations,
        documents,
      ] = await Promise.all([
        prisma.userSettings.findUnique({ where: { userId } }),
        prisma.course?.findMany
          ? prisma.course.findMany({ where: { userId } })
          : Promise.resolve([]),
        prisma.note?.findMany ? prisma.note.findMany({ where: { userId } }) : Promise.resolve([]),
        prisma.task?.findMany ? prisma.task.findMany({ where: { userId } }) : Promise.resolve([]),
        prisma.timetableEntry?.findMany
          ? prisma.timetableEntry.findMany({ where: { userId } })
          : Promise.resolve([]),
        prisma.exam?.findMany ? prisma.exam.findMany({ where: { userId } }) : Promise.resolve([]),
        prisma.revisionPlan?.findMany
          ? prisma.revisionPlan.findMany({
              where: { userId },
              include: { sessions: { orderBy: [{ scheduledDate: 'asc' }, { position: 'asc' }] } },
            })
          : Promise.resolve([]),
        prisma.deck?.findMany
          ? prisma.deck.findMany({
              where: { userId },
              include: {
                cards: {
                  orderBy: { position: 'asc' },
                  select: {
                    id: true,
                    deckId: true,
                    front: true,
                    back: true,
                    topic: true,
                    imageUrl: true,
                    position: true,
                    easeFactor: true,
                    intervalDays: true,
                    repetitions: true,
                    lapses: true,
                    dueAt: true,
                    lastReviewedAt: true,
                    createdAt: true,
                  },
                },
              },
            })
          : Promise.resolve([]),
        prisma.reviewLog?.findMany
          ? prisma.reviewLog.findMany({ where: { userId } })
          : Promise.resolve([]),
        prisma.quiz?.findMany
          ? prisma.quiz.findMany({
              where: { userId },
              include: { questions: true, attempts: true },
            })
          : Promise.resolve([]),
        prisma.gradingScale?.findMany
          ? prisma.gradingScale.findMany({ where: { userId } })
          : Promise.resolve([]),
        prisma.gradeRecord?.findMany
          ? prisma.gradeRecord.findMany({ where: { userId } })
          : Promise.resolve([]),
        prisma.studySession?.findMany
          ? prisma.studySession.findMany({ where: { userId } })
          : Promise.resolve([]),
        prisma.notification?.findMany
          ? prisma.notification.findMany({ where: { userId } })
          : Promise.resolve([]),
        prisma.conversation?.findMany
          ? prisma.conversation.findMany({
              where: { userId },
              include: { messages: { orderBy: { createdAt: 'asc' } } },
            })
          : Promise.resolve([]),
        prisma.document?.findMany
          ? prisma.document.findMany({
              where: { userId },
              select: {
                id: true,
                courseId: true,
                title: true,
                type: true,
                originalName: true,
                mimeType: true,
                kind: true,
                sizeBytes: true,
                pageCount: true,
                status: true,
                extractedText: true,
                createdAt: true,
                updatedAt: true,
              },
            })
          : Promise.resolve([]),
      ]);

      return {
        exportedAt: new Date().toISOString(),
        version: 1,
        user: toPublicUser(user),
        settings: settings ? toPublicSettings(settings) : null,
        courses,
        notes,
        tasks,
        timetableEntries,
        exams,
        revisionPlans,
        decks,
        reviewLogs,
        quizzes,
        gradingScales,
        gradeRecords,
        studySessions,
        notifications,
        conversations,
        documents,
      };
    },
  };
}
