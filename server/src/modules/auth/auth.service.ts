import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PrismaClient, User } from '@prisma/client';
import type { Logger } from 'pino';
import type { Env } from '../../config/env';
import type { EmailService } from '../../lib/email';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import {
  generateOpaqueToken,
  hashToken,
  REFRESH_TTL_PERSISTENT_MS,
  REFRESH_TTL_SESSION_MS,
  RESET_PASSWORD_TTL_MS,
  signAccessToken,
  VERIFY_EMAIL_TTL_MS,
} from '../../lib/tokens';
import type { LoginInput, ResetPasswordInput, SignupInput } from './auth.schemas';

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes
// Dummy argon2id hash used to equalise timing when an email is not found on login.
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  studentId: string | null;
  programme: string | null;
  level: string | null;
  university: string | null;
  bio: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
  createdAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    studentId: user.studentId,
    programme: user.programme,
    level: user.level,
    university: user.university,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    hasPassword: user.passwordHash !== null,
    createdAt: user.createdAt,
  };
}

function isValidTimezone(tz: string | undefined): tz is string {
  if (!tz) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface AuthSessionResult {
  accessToken: string;
  expiresIn: number;
  user: PublicUser;
  rawRefreshToken: string;
  persistent: boolean;
}

export interface AuthServiceDeps {
  prisma: PrismaClient;
  env: Pick<Env, 'JWT_SECRET' | 'CLIENT_URL' | 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET'>;
  email: EmailService;
  logger: Logger;
  now?: () => Date;
}

export function createAuthService(deps: AuthServiceDeps) {
  const { prisma, env, email, logger } = deps;
  const now = deps.now ?? (() => new Date());

  async function issueSession(
    user: User,
    persistent: boolean,
    meta: SessionMeta,
    familyId = randomUUID(),
  ): Promise<AuthSessionResult> {
    const { raw, hash } = generateOpaqueToken();
    const ttl = persistent ? REFRESH_TTL_PERSISTENT_MS : REFRESH_TTL_SESSION_MS;
    const expiresAt = new Date(now().getTime() + ttl);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: hash,
        expiresAt,
        persistent,
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });

    const { token: accessToken, expiresIn } = signAccessToken(user.id, env.JWT_SECRET);
    return { accessToken, expiresIn, user: toPublicUser(user), rawRefreshToken: raw, persistent };
  }

  async function createAndSendVerifyToken(user: Pick<User, 'id' | 'email' | 'name'>) {
    const current = now();
    const { raw, hash } = generateOpaqueToken();
    const expiresAt = new Date(current.getTime() + VERIFY_EMAIL_TTL_MS);

    await prisma.$transaction([
      prisma.emailToken.updateMany({
        where: { userId: user.id, type: 'verify_email', usedAt: null },
        data: { usedAt: current },
      }),
      prisma.emailToken.create({
        data: { userId: user.id, type: 'verify_email', tokenHash: hash, expiresAt },
      }),
    ]);

    const url = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(raw)}`;
    try {
      await email.sendVerificationEmail(user.email, user.name, url);
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Failed to send verification email');
    }
  }

  return {
    async signup(input: SignupInput, meta: SessionMeta): Promise<AuthSessionResult> {
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) {
        throw new AppError('EMAIL_TAKEN');
      }

      const passwordHash = await hashPassword(input.password);
      const timezone = isValidTimezone(input.timezone) ? input.timezone : 'UTC';

      const user = await prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          settings: { create: { timezone } },
        },
      });

      await createAndSendVerifyToken(user);
      return issueSession(user, false, meta);
    },

    async login(input: LoginInput, meta: SessionMeta): Promise<AuthSessionResult> {
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      const current = now();

      if (!user) {
        await verifyPassword(DUMMY_HASH, input.password);
        throw new AppError('INVALID_CREDENTIALS');
      }

      if (user.lockedUntil && user.lockedUntil > current) {
        const retryAfterSeconds = Math.ceil((user.lockedUntil.getTime() - current.getTime()) / 1000);
        throw new AppError('ACCOUNT_LOCKED', undefined, { retryAfterSeconds });
      }

      if (!user.passwordHash) {
        await verifyPassword(DUMMY_HASH, input.password);
        throw new AppError('INVALID_CREDENTIALS');
      }

      const valid = await verifyPassword(user.passwordHash, input.password);
      if (!valid) {
        const nextCount = user.failedLoginCount + 1;
        const shouldLock = nextCount >= MAX_FAILED_LOGINS;
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: shouldLock ? 0 : nextCount,
            lockedUntil: shouldLock ? new Date(current.getTime() + LOCK_DURATION_MS) : null,
          },
        });
        if (shouldLock) {
          throw new AppError('ACCOUNT_LOCKED', undefined, {
            retryAfterSeconds: Math.ceil(LOCK_DURATION_MS / 1000),
          });
        }
        throw new AppError('INVALID_CREDENTIALS');
      }

      if (user.failedLoginCount > 0 || user.lockedUntil) {
        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null },
        });
      }

      return issueSession(user, input.rememberMe, meta);
    },

    async refresh(rawRefreshToken: string | undefined, meta: SessionMeta): Promise<AuthSessionResult> {
      if (!rawRefreshToken) {
        throw new AppError('REFRESH_INVALID');
      }

      const tokenHash = hashToken(rawRefreshToken);
      const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });
      const current = now();

      if (!existing || existing.expiresAt <= current) {
        throw new AppError('REFRESH_INVALID');
      }

      // Reuse of an already-rotated token revokes the entire token family (SECURITY.md T5).
      if (existing.revokedAt !== null) {
        await prisma.refreshToken.updateMany({
          where: { familyId: existing.familyId, revokedAt: null },
          data: { revokedAt: current },
        });
        logger.warn({ userId: existing.userId, familyId: existing.familyId }, 'Refresh token reuse detected');
        throw new AppError('REFRESH_INVALID');
      }

      const user = await prisma.user.findUnique({ where: { id: existing.userId } });
      if (!user) {
        throw new AppError('REFRESH_INVALID');
      }

      const { raw, hash } = generateOpaqueToken();
      const ttl = existing.persistent ? REFRESH_TTL_PERSISTENT_MS : REFRESH_TTL_SESSION_MS;
      const expiresAt = new Date(current.getTime() + ttl);

      await prisma.$transaction(async (tx) => {
        const nextToken = await tx.refreshToken.create({
          data: {
            userId: user.id,
            familyId: existing.familyId,
            tokenHash: hash,
            expiresAt,
            persistent: existing.persistent,
            userAgent: meta.userAgent,
            ip: meta.ip,
          },
        });
        await tx.refreshToken.update({
          where: { id: existing.id },
          data: { revokedAt: current, replacedById: nextToken.id },
        });
      });

      const { token: accessToken, expiresIn } = signAccessToken(user.id, env.JWT_SECRET);
      return {
        accessToken,
        expiresIn,
        user: toPublicUser(user),
        rawRefreshToken: raw,
        persistent: existing.persistent,
      };
    },

    async logout(rawRefreshToken: string | undefined): Promise<void> {
      if (!rawRefreshToken) return;
      const tokenHash = hashToken(rawRefreshToken);
      await prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: now() },
      });
    },

    async logoutAll(userId: string): Promise<void> {
      await prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now() },
      });
    },

    async verifyEmail(rawToken: string): Promise<{ verified: true }> {
      const tokenHash = hashToken(rawToken);
      const current = now();
      const record = await prisma.emailToken.findUnique({ where: { tokenHash } });

      if (!record || record.type !== 'verify_email' || record.usedAt !== null || record.expiresAt <= current) {
        throw new AppError('INVALID_TOKEN');
      }

      await prisma.$transaction([
        prisma.emailToken.update({ where: { id: record.id }, data: { usedAt: current } }),
        prisma.user.update({ where: { id: record.userId }, data: { emailVerified: true } }),
      ]);

      return { verified: true };
    },

    async resendVerification(userId: string): Promise<{ sent: boolean; reason?: string }> {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError('UNAUTHENTICATED');
      if (user.emailVerified) {
        return { sent: false, reason: 'already_verified' };
      }
      await createAndSendVerifyToken(user);
      return { sent: true };
    },

    async forgotPassword(emailAddress: string): Promise<{ message: string }> {
      const user = await prisma.user.findUnique({ where: { email: emailAddress } });
      if (user) {
        const current = now();
        const { raw, hash } = generateOpaqueToken();
        const expiresAt = new Date(current.getTime() + RESET_PASSWORD_TTL_MS);

        await prisma.$transaction([
          prisma.emailToken.updateMany({
            where: { userId: user.id, type: 'reset_password', usedAt: null },
            data: { usedAt: current },
          }),
          prisma.emailToken.create({
            data: { userId: user.id, type: 'reset_password', tokenHash: hash, expiresAt },
          }),
        ]);

        const url = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(raw)}`;
        try {
          await email.sendPasswordResetEmail(user.email, user.name, url);
        } catch (err) {
          logger.error({ err, userId: user.id }, 'Failed to send password reset email');
        }
      }
      return { message: 'If that email exists, a reset link was sent.' };
    },

    async resetPassword(input: ResetPasswordInput): Promise<{ reset: true }> {
      const tokenHash = hashToken(input.token);
      const current = now();
      const record = await prisma.emailToken.findUnique({ where: { tokenHash } });

      if (!record || record.type !== 'reset_password' || record.usedAt !== null || record.expiresAt <= current) {
        throw new AppError('INVALID_TOKEN');
      }

      const passwordHash = await hashPassword(input.password);

      await prisma.$transaction([
        prisma.emailToken.update({ where: { id: record.id }, data: { usedAt: current } }),
        prisma.user.update({
          where: { id: record.userId },
          data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
        }),
        prisma.refreshToken.updateMany({
          where: { userId: record.userId, revokedAt: null },
          data: { revokedAt: current },
        }),
      ]);

      return { reset: true };
    },

    getProviders(): { google: boolean } {
      return { google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) };
    },

    /** Builds the Google Authorization Code + PKCE redirect URL and state/verifier cookie payload. */
    beginGoogleOAuth(redirectUri: string) {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        throw new AppError('NOT_FOUND');
      }
      const state = randomBytes(16).toString('base64url');
      const codeVerifier = randomBytes(32).toString('base64url');
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });

      return {
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        state,
        codeVerifier,
      };
    },

    async completeGoogleOAuth(
      code: string,
      codeVerifier: string,
      redirectUri: string,
      meta: SessionMeta,
    ): Promise<AuthSessionResult> {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        throw new AppError('NOT_FOUND');
      }

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      });
      if (!tokenRes.ok) {
        throw new AppError('UNAUTHENTICATED', 'Google authentication failed');
      }
      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        throw new AppError('UNAUTHENTICATED', 'Google authentication failed');
      }

      const userRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userRes.ok) {
        throw new AppError('UNAUTHENTICATED', 'Could not load Google profile');
      }
      const profile = (await userRes.json()) as {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      };

      if (!profile.sub || !profile.email || !profile.email_verified) {
        throw new AppError('UNAUTHENTICATED', 'Google email must be verified');
      }

      const emailLower = profile.email.toLowerCase();
      const identity = await prisma.authIdentity.findUnique({
        where: { provider_providerUserId: { provider: 'google', providerUserId: profile.sub } },
        include: { user: true },
      });

      let user: User;
      if (identity) {
        user = identity.user;
      } else {
        const existingByEmail = await prisma.user.findUnique({ where: { email: emailLower } });
        if (existingByEmail) {
          await prisma.authIdentity.create({
            data: {
              userId: existingByEmail.id,
              provider: 'google',
              providerUserId: profile.sub,
              email: emailLower,
            },
          });
          user = existingByEmail.emailVerified
            ? existingByEmail
            : await prisma.user.update({
                where: { id: existingByEmail.id },
                data: { emailVerified: true },
              });
        } else {
          user = await prisma.user.create({
            data: {
              email: emailLower,
              name: (profile.name ?? emailLower.split('@')[0] ?? 'Student').slice(0, 100),
              emailVerified: true,
              avatarUrl: profile.picture ?? null,
              settings: { create: { timezone: 'UTC' } },
              identities: {
                create: {
                  provider: 'google',
                  providerUserId: profile.sub,
                  email: emailLower,
                },
              },
            },
          });
        }
      }

      return issueSession(user, true, meta);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

