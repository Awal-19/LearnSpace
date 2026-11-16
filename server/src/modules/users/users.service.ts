import type { PrismaClient, UserSettings } from '@prisma/client';
import type { Logger } from 'pino';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import { detectImageMime, type StorageService } from '../../lib/storage';
import { hashToken } from '../../lib/tokens';
import { toPublicUser, type PublicUser } from '../auth/auth.service';
import { getUserStats, type UserStats } from './stats';
import type {
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
  };
}

export interface UsersServiceDeps {
  prisma: PrismaClient;
  storage: StorageService;
  logger: Logger;
}

export interface UsersService {
  getMe(userId: string): Promise<PublicUser>;
  updateMe(userId: string, input: UpdateProfileInput): Promise<PublicUser>;
  uploadAvatar(userId: string, buffer: Buffer): Promise<{ avatarUrl: string }>;
  deleteAvatar(userId: string): Promise<void>;
  changePassword(userId: string, input: ChangePasswordInput, currentRefreshToken?: string): Promise<void>;
  deleteAccount(userId: string, input: DeleteAccountInput, tokenIssuedAtSec?: number): Promise<void>;
  getStats(userId: string): Promise<UserStats>;
  getSettings(userId: string): Promise<PublicSettings>;
  updateSettings(userId: string, input: UpdateSettingsInput): Promise<PublicSettings>;
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

    async uploadAvatar(userId, buffer) {
      const mime = detectImageMime(buffer);
      if (!mime) {
        throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Avatar must be a valid JPEG, PNG, or WebP image');
      }

      const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatarPublicId: true },
      });
      if (!existing) throw new AppError('UNAUTHENTICATED');

      const uploaded = await storage.uploadAvatar(buffer, userId);

      await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: uploaded.url, avatarPublicId: uploaded.publicId },
      });

      if (existing.avatarPublicId && existing.avatarPublicId !== uploaded.publicId) {
        await storage.deleteAvatar(existing.avatarPublicId);
      }

      return { avatarUrl: uploaded.url };
    },

    async deleteAvatar(userId) {
      const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { avatarPublicId: true },
      });
      if (!existing) throw new AppError('UNAUTHENTICATED');

      await prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: null, avatarPublicId: null },
      });

      if (existing.avatarPublicId) {
        await storage.deleteAvatar(existing.avatarPublicId);
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
          throw new AppError(
            'UNAUTHENTICATED',
            'Please log in again before deleting your account',
          );
        }
      }

      await prisma.user.delete({ where: { id: userId } });

      if (user.avatarPublicId) {
        await storage.deleteAvatar(user.avatarPublicId);
      }

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
  };
}

