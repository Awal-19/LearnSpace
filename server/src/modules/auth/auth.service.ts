import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { PrismaClient, User, UserRole, UserStatus } from '@prisma/client';
import type { Logger } from 'pino';
import type { Env } from '../../config/env';
import type { EmailService } from '../../lib/email';
import { AppError } from '../../lib/errors';
import { hashPassword, verifyPassword } from '../../lib/password';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  ADMIN_2FA_TTL_MS,
  ADMIN_ACCESS_TOKEN_TTL_SECONDS,
  ADMIN_REFRESH_TTL_MS,
  generateOpaqueToken,
  hashToken,
  OTP_TTL_MS,
  REFRESH_TTL_PERSISTENT_MS,
  REFRESH_TTL_SESSION_MS,
  RESET_PASSWORD_TTL_MS,
  signAccessToken,
  VERIFY_EMAIL_TTL_MS,
} from '../../lib/tokens';
import { recordActivityEvent, recordLoginHistory } from '../admin/admin.logging';
import type { AvatarConfig } from '../users/users.schemas';
import {
  CURRENT_PRIVACY_POLICY_VERSION,
  CURRENT_TERMS_VERSION,
  TERMS_CONSENT_REQUIRED_MESSAGE,
  type LoginInput,
  type ResetPasswordInput,
  type SignupInput,
} from './auth.schemas';

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
  role: UserRole;
  status: UserStatus;
  twoFactorEnabled: boolean;
  studentId: string | null;
  programme: string | null;
  level: string | null;
  university: string | null;
  bio: string | null;
  avatarUrl: string | null;
  avatarConfig: AvatarConfig | null;
  hasPassword: boolean;
  termsAccepted: boolean;
  termsVersion: string | null;
  termsAcceptedAt: Date | null;
  privacyPolicyVersion: string | null;
  privacyPolicyAcceptedAt: Date | null;
  createdAt: Date;
}

export function toPublicUser(user: User): PublicUser {
  const rawConfig = (user as { avatarConfig?: AvatarConfig | null }).avatarConfig;
  const consent = user as Partial<
    Pick<
      User,
      | 'termsAccepted'
      | 'termsVersion'
      | 'termsAcceptedAt'
      | 'privacyPolicyVersion'
      | 'privacyPolicyAcceptedAt'
    >
  >;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    role: user.role ?? 'student',
    status: user.status ?? 'active',
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    studentId: user.studentId,
    programme: user.programme,
    level: user.level,
    university: user.university,
    bio: user.bio,
    avatarUrl: user.avatarUrl,
    avatarConfig: rawConfig ?? null,
    hasPassword: user.passwordHash !== null,
    termsAccepted: Boolean(consent.termsAccepted),
    termsVersion: consent.termsVersion ?? null,
    termsAcceptedAt: consent.termsAcceptedAt ?? null,
    privacyPolicyVersion: consent.privacyPolicyVersion ?? null,
    privacyPolicyAcceptedAt: consent.privacyPolicyAcceptedAt ?? null,
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

export type LoginResult =
  (AuthSessionResult & { requiresTwoFactor?: false }) | { requiresTwoFactor: true; email: string };

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
    const isAdmin = user.role === 'admin' || user.role === 'super_admin';
    const effectivePersistent = isAdmin ? false : persistent;
    const { raw, hash } = generateOpaqueToken();
    const ttl = isAdmin
      ? ADMIN_REFRESH_TTL_MS
      : effectivePersistent
        ? REFRESH_TTL_PERSISTENT_MS
        : REFRESH_TTL_SESSION_MS;
    const expiresAt = new Date(now().getTime() + ttl);

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: hash,
        expiresAt,
        persistent: effectivePersistent,
        userAgent: meta.userAgent,
        ip: meta.ip,
      },
    });

    const accessTtl = isAdmin ? ADMIN_ACCESS_TOKEN_TTL_SECONDS : ACCESS_TOKEN_TTL_SECONDS;
    const { token: accessToken, expiresIn } = signAccessToken(user.id, env.JWT_SECRET, accessTtl);
    return {
      accessToken,
      expiresIn,
      user: toPublicUser(user),
      rawRefreshToken: raw,
      persistent: effectivePersistent,
    };
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

  async function createAndSendVerificationOtp(
    user: Pick<User, 'id' | 'email' | 'name'>,
    enforceCooldown: boolean,
  ): Promise<{ sent: boolean; retryAfterSeconds?: number }> {
    const current = now();
    if (enforceCooldown && prisma.otpCode?.findFirst) {
      const latest = await prisma.otpCode.findFirst({
        where: { userId: user.id, purpose: 'verify_email' },
        orderBy: { createdAt: 'desc' },
      });
      if (latest) {
        const elapsedMs = current.getTime() - latest.createdAt.getTime();
        if (elapsedMs < 60_000) {
          return { sent: false, retryAfterSeconds: Math.ceil((60_000 - elapsedMs) / 1000) };
        }
      }
    }

    const code = String(randomInt(100_000, 1_000_000));
    const codeHash = hashToken(code);
    const expiresAt = new Date(current.getTime() + OTP_TTL_MS);

    if (prisma.otpCode?.create) {
      await prisma.$transaction([
        prisma.otpCode.updateMany({
          where: { userId: user.id, purpose: 'verify_email', usedAt: null },
          data: { usedAt: current },
        }),
        prisma.otpCode.create({
          data: {
            userId: user.id,
            purpose: 'verify_email',
            codeHash,
            expiresAt,
          },
        }),
      ]);
    }

    try {
      await email.sendOtpEmail({ email: user.email, name: user.name, code });
    } catch (err) {
      logger.error({ err, userId: user.id }, 'Failed to send verification OTP email');
    }
    return { sent: true };
  }

  return {
    async signup(
      input: SignupInput,
      _meta: SessionMeta,
    ): Promise<{ requiresVerification: true; email: string; verificationToken: string }> {
      if (prisma.appSettings?.findUnique) {
        const settings = await prisma.appSettings.findUnique({ where: { id: 'global' } });
        if (settings && !settings.featureSignups) {
          throw new AppError('FORBIDDEN', 'New sign-ups are currently disabled.');
        }
      }

      if (input.acceptTerms !== true) {
        throw new AppError('VALIDATION_ERROR', TERMS_CONSENT_REQUIRED_MESSAGE);
      }

      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) {
        throw new AppError('EMAIL_TAKEN');
      }

      const passwordHash = await hashPassword(input.password);
      const timezone = isValidTimezone(input.timezone) ? input.timezone : 'UTC';
      const acceptedAt = now();

      const user = await prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash,
          emailVerified: false,
          termsAccepted: true,
          termsVersion: CURRENT_TERMS_VERSION,
          termsAcceptedAt: acceptedAt,
          privacyPolicyVersion: CURRENT_PRIVACY_POLICY_VERSION,
          privacyPolicyAcceptedAt: acceptedAt,
          settings: { create: { timezone } },
        },
      });

      await createAndSendVerificationOtp(user, false);
      await recordActivityEvent(prisma, { userId: user.id, action: 'signup' });
      const { token: verificationToken } = signAccessToken(
        user.id,
        env.JWT_SECRET,
        900,
        'verify_only',
      );
      return { requiresVerification: true, email: user.email, verificationToken };
    },

    async login(input: LoginInput, meta: SessionMeta): Promise<LoginResult> {
      const user = await prisma.user.findUnique({ where: { email: input.email } });
      const current = now();

      if (!user) {
        await verifyPassword(DUMMY_HASH, input.password);
        await recordLoginHistory(prisma, {
          email: input.email,
          method: 'email',
          success: false,
          ip: meta.ip,
          userAgent: meta.userAgent,
          reason: 'unknown_email',
        });
        throw new AppError('INVALID_CREDENTIALS');
      }

      if (user.lockedUntil && user.lockedUntil > current) {
        const retryAfterSeconds = Math.ceil(
          (user.lockedUntil.getTime() - current.getTime()) / 1000,
        );
        await recordLoginHistory(prisma, {
          userId: user.id,
          email: user.email,
          method: 'email',
          success: false,
          ip: meta.ip,
          userAgent: meta.userAgent,
          suspicious: true,
          reason: 'account_locked',
        });
        throw new AppError('ACCOUNT_LOCKED', undefined, { retryAfterSeconds });
      }

      if (!user.passwordHash) {
        await verifyPassword(DUMMY_HASH, input.password);
        await recordLoginHistory(prisma, {
          userId: user.id,
          email: user.email,
          method: 'email',
          success: false,
          ip: meta.ip,
          userAgent: meta.userAgent,
          reason: 'google_only_account',
        });
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
        await recordLoginHistory(prisma, {
          userId: user.id,
          email: user.email,
          method: 'email',
          success: false,
          ip: meta.ip,
          userAgent: meta.userAgent,
          suspicious: nextCount >= 3 || shouldLock,
          reason: shouldLock ? 'locked_after_failures' : 'invalid_password',
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

      if (!user.emailVerified) {
        await createAndSendVerificationOtp(user, true);
        const { token: verificationToken } = signAccessToken(
          user.id,
          env.JWT_SECRET,
          900,
          'verify_only',
        );
        throw new AppError(
          'EMAIL_NOT_VERIFIED',
          'Please verify your email with the 6-digit code sent to your inbox.',
          { email: user.email, verificationToken },
        );
      }

      if (user.status === 'suspended') {
        await recordLoginHistory(prisma, {
          userId: user.id,
          email: user.email,
          method: 'email',
          success: false,
          ip: meta.ip,
          userAgent: meta.userAgent,
          suspicious: true,
          reason: 'account_suspended',
        });
        throw new AppError(
          'ACCOUNT_SUSPENDED',
          user.suspendedReason
            ? `Your account has been suspended: ${user.suspendedReason}`
            : undefined,
        );
      }

      const isAdmin = user.role === 'admin' || user.role === 'super_admin';
      if (isAdmin && user.twoFactorEnabled) {
        const code = String(randomInt(100000, 1000000));
        const codeHash = hashToken(code);
        const expiresAt = new Date(current.getTime() + ADMIN_2FA_TTL_MS);
        await prisma.$transaction([
          prisma.otpCode.updateMany({
            where: { userId: user.id, purpose: 'admin_2fa', usedAt: null },
            data: { usedAt: current },
          }),
          prisma.otpCode.create({
            data: { userId: user.id, purpose: 'admin_2fa', codeHash, expiresAt },
          }),
        ]);
        try {
          await email.sendOtpEmail({ email: user.email, name: user.name, code });
        } catch (err) {
          logger.error({ err, userId: user.id }, 'Failed to send admin 2FA OTP');
        }
        return { requiresTwoFactor: true, email: user.email };
      }

      await recordLoginHistory(prisma, {
        userId: user.id,
        email: user.email,
        method: 'email',
        success: true,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      await recordActivityEvent(prisma, {
        userId: user.id,
        action: 'login',
        metadata: { method: 'email' },
      });
      return issueSession(user, input.rememberMe, meta);
    },

    async verifyAdminTwoFactor(
      emailInput: string,
      code: string,
      meta: SessionMeta,
    ): Promise<AuthSessionResult> {
      const user = await prisma.user.findUnique({ where: { email: emailInput.toLowerCase() } });
      if (!user || user.status === 'suspended') {
        throw new AppError('INVALID_TOKEN', 'Invalid or expired verification code');
      }
      const current = now();
      const otp = await prisma.otpCode.findFirst({
        where: { userId: user.id, purpose: 'admin_2fa', usedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (!otp || otp.expiresAt <= current) {
        if (otp) {
          await prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: current } });
        }
        throw new AppError('INVALID_TOKEN', 'Invalid or expired verification code');
      }
      if (otp.attempts >= 5) {
        await prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: current } });
        throw new AppError('RATE_LIMITED', 'Too many incorrect attempts. Sign in again.');
      }
      if (otp.codeHash !== hashToken(code)) {
        const nextAttempts = otp.attempts + 1;
        await prisma.otpCode.update({
          where: { id: otp.id },
          data: {
            attempts: nextAttempts,
            ...(nextAttempts >= 5 ? { usedAt: current } : {}),
          },
        });
        if (nextAttempts >= 5) {
          throw new AppError('RATE_LIMITED', 'Too many incorrect attempts. Sign in again.');
        }
        throw new AppError('INVALID_TOKEN', 'Invalid or expired verification code');
      }
      await prisma.otpCode.update({
        where: { id: otp.id },
        data: { usedAt: current },
      });
      await recordLoginHistory(prisma, {
        userId: user.id,
        email: user.email,
        method: 'email',
        success: true,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      await recordActivityEvent(prisma, {
        userId: user.id,
        action: 'login',
        metadata: { method: 'email_2fa' },
      });
      return issueSession(user, false, meta);
    },

    async refresh(
      rawRefreshToken: string | undefined,
      meta: SessionMeta,
    ): Promise<AuthSessionResult> {
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
        logger.warn(
          { userId: existing.userId, familyId: existing.familyId },
          'Refresh token reuse detected',
        );
        throw new AppError('REFRESH_INVALID');
      }

      const user = await prisma.user.findUnique({ where: { id: existing.userId } });
      if (!user) {
        throw new AppError('REFRESH_INVALID');
      }
      if (user.status === 'suspended') {
        await prisma.refreshToken.updateMany({
          where: { familyId: existing.familyId, revokedAt: null },
          data: { revokedAt: current },
        });
        throw new AppError('ACCOUNT_SUSPENDED');
      }
      if (!user.emailVerified) {
        await prisma.refreshToken.updateMany({
          where: { familyId: existing.familyId, revokedAt: null },
          data: { revokedAt: current },
        });
        const { token: verificationToken } = signAccessToken(
          user.id,
          env.JWT_SECRET,
          900,
          'verify_only',
        );
        throw new AppError(
          'EMAIL_NOT_VERIFIED',
          'Please verify your email with the 6-digit code sent to your inbox.',
          { email: user.email, verificationToken },
        );
      }

      const isAdmin = user.role === 'admin' || user.role === 'super_admin';
      const { raw, hash } = generateOpaqueToken();
      const ttl = isAdmin
        ? ADMIN_REFRESH_TTL_MS
        : existing.persistent
          ? REFRESH_TTL_PERSISTENT_MS
          : REFRESH_TTL_SESSION_MS;
      const expiresAt = new Date(current.getTime() + ttl);

      await prisma.$transaction(async (tx) => {
        const nextToken = await tx.refreshToken.create({
          data: {
            userId: user.id,
            familyId: existing.familyId,
            tokenHash: hash,
            expiresAt,
            persistent: isAdmin ? false : existing.persistent,
            userAgent: meta.userAgent,
            ip: meta.ip,
          },
        });
        await tx.refreshToken.update({
          where: { id: existing.id },
          data: { revokedAt: current, replacedById: nextToken.id },
        });
      });

      const accessTtl = isAdmin ? ADMIN_ACCESS_TOKEN_TTL_SECONDS : ACCESS_TOKEN_TTL_SECONDS;
      const { token: accessToken, expiresIn } = signAccessToken(user.id, env.JWT_SECRET, accessTtl);
      return {
        accessToken,
        expiresIn,
        user: toPublicUser(user),
        rawRefreshToken: raw,
        persistent: isAdmin ? false : existing.persistent,
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
      const current = now();
      await prisma.$transaction([
        prisma.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: current },
        }),
        prisma.user.update({
          where: { id: userId },
          data: { tokensValidAfter: current },
        }),
      ]);
    },

    async verifyEmail(rawToken: string): Promise<{ verified: true }> {
      const tokenHash = hashToken(rawToken);
      const current = now();
      const record = await prisma.emailToken.findUnique({ where: { tokenHash } });

      if (
        !record ||
        record.type !== 'verify_email' ||
        record.usedAt !== null ||
        record.expiresAt <= current
      ) {
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

      if (
        !record ||
        record.type !== 'reset_password' ||
        record.usedAt !== null ||
        record.expiresAt <= current
      ) {
        throw new AppError('INVALID_TOKEN');
      }

      const passwordHash = await hashPassword(input.password);

      await prisma.$transaction([
        prisma.emailToken.update({ where: { id: record.id }, data: { usedAt: current } }),
        prisma.user.update({
          where: { id: record.userId },
          data: {
            passwordHash,
            failedLoginCount: 0,
            lockedUntil: null,
            tokensValidAfter: current,
          },
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
      const nonce = randomBytes(16).toString('base64url');
      const codeVerifier = randomBytes(32).toString('base64url');
      const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

      const params = new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        prompt: 'select_account',
      });

      return {
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
        state,
        nonce,
        codeVerifier,
      };
    },

    async completeGoogleOAuth(
      code: string,
      codeVerifier: string,
      redirectUri: string,
      meta: SessionMeta,
      expectedNonce?: string,
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
      const tokenData = (await tokenRes.json()) as { access_token?: string; id_token?: string };
      if (!tokenData.access_token) {
        throw new AppError('UNAUTHENTICATED', 'Google authentication failed');
      }

      if (tokenData.id_token) {
        try {
          const [, payloadB64] = tokenData.id_token.split('.');
          if (!payloadB64) throw new Error('Malformed id_token');
          const idClaims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
            iss?: string;
            aud?: string;
            nonce?: string;
            email_verified?: boolean;
          };
          const validIssuer =
            idClaims.iss === 'https://accounts.google.com' ||
            idClaims.iss === 'accounts.google.com';
          if (
            !validIssuer ||
            idClaims.aud !== env.GOOGLE_CLIENT_ID ||
            (expectedNonce && idClaims.nonce !== expectedNonce) ||
            idClaims.email_verified === false
          ) {
            throw new AppError('UNAUTHENTICATED', 'Invalid Google ID token claims');
          }
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError('UNAUTHENTICATED', 'Google authentication failed');
        }
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

      if (!profile.sub || !profile.email) {
        throw new AppError('UNAUTHENTICATED', 'Google email is required');
      }
      if (!profile.email_verified) {
        throw new AppError(
          'EMAIL_NOT_VERIFIED',
          'Google has not verified this email address. Please verify your email first.',
          { email: profile.email.toLowerCase() },
        );
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
          const current = now();
          user = await prisma.$transaction(async (tx) => {
            await tx.authIdentity.create({
              data: {
                userId: existingByEmail.id,
                provider: 'google',
                providerUserId: profile.sub!,
                email: emailLower,
              },
            });
            if (existingByEmail.emailVerified) {
              return existingByEmail;
            }
            // Clear any pre-registered unverified passwordHash to prevent OAuth pre-hijacking.
            await tx.refreshToken.updateMany({
              where: { userId: existingByEmail.id, revokedAt: null },
              data: { revokedAt: current },
            });
            await tx.otpCode.updateMany({
              where: { userId: existingByEmail.id, usedAt: null },
              data: { usedAt: current },
            });
            return tx.user.update({
              where: { id: existingByEmail.id },
              data: {
                emailVerified: true,
                ...(existingByEmail.passwordHash !== null
                  ? { passwordHash: null, tokensValidAfter: current }
                  : {}),
              },
            });
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

      if (user.status === 'suspended') {
        await recordLoginHistory(prisma, {
          userId: user.id,
          email: user.email,
          method: 'google',
          success: false,
          ip: meta.ip,
          userAgent: meta.userAgent,
          suspicious: true,
          reason: 'account_suspended',
        });
        throw new AppError('ACCOUNT_SUSPENDED');
      }

      await recordLoginHistory(prisma, {
        userId: user.id,
        email: user.email,
        method: 'google',
        success: true,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      await recordActivityEvent(prisma, {
        userId: user.id,
        action: 'login',
        metadata: { method: 'google' },
      });
      return issueSession(user, true, meta);
    },

    async verifyOtp(
      input: { email: string; code: string },
      meta: SessionMeta,
    ): Promise<AuthSessionResult> {
      const current = now();
      const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
      if (!user || user.emailVerified) {
        throw new AppError('VALIDATION_ERROR', 'Invalid or expired verification code.');
      }
      if (user.status === 'suspended') {
        throw new AppError('ACCOUNT_SUSPENDED');
      }

      const otp = await prisma.otpCode.findFirst({
        where: { userId: user.id, purpose: 'verify_email', usedAt: null },
        orderBy: { createdAt: 'desc' },
      });
      if (!otp) {
        throw new AppError('VALIDATION_ERROR', 'Invalid or expired verification code.');
      }
      if (otp.expiresAt <= current) {
        await prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: current } });
        throw new AppError('VALIDATION_ERROR', 'Invalid or expired verification code.');
      }
      if (otp.attempts >= 5) {
        await prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: current } });
        throw new AppError('RATE_LIMITED', 'Too many incorrect attempts. Request a new code.');
      }

      if (otp.codeHash !== hashToken(input.code)) {
        const nextAttempts = otp.attempts + 1;
        await prisma.otpCode.update({
          where: { id: otp.id },
          data: {
            attempts: nextAttempts,
            ...(nextAttempts >= 5 ? { usedAt: current } : {}),
          },
        });
        if (nextAttempts >= 5) {
          throw new AppError('RATE_LIMITED', 'Too many incorrect attempts. Request a new code.');
        }
        throw new AppError('VALIDATION_ERROR', 'Incorrect verification code.');
      }

      const [, verifiedUser] = await prisma.$transaction([
        prisma.otpCode.update({ where: { id: otp.id }, data: { usedAt: current } }),
        prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
      ]);

      await recordLoginHistory(prisma, {
        userId: verifiedUser.id,
        email: verifiedUser.email,
        method: 'email',
        success: true,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });
      await recordActivityEvent(prisma, {
        userId: verifiedUser.id,
        action: 'email_verified',
      });
      return issueSession(verifiedUser, false, meta);
    },

    async resendOtp(emailInput: string): Promise<{ ok: true; message: string }> {
      const generic = {
        ok: true as const,
        message: 'If an unverified account exists, a verification code has been sent.',
      };
      const user = await prisma.user.findUnique({ where: { email: emailInput.toLowerCase() } });
      if (!user || user.emailVerified) {
        return generic;
      }
      const res = await createAndSendVerificationOtp(user, true);
      if (!res.sent && res.retryAfterSeconds) {
        throw new AppError(
          'RATE_LIMITED',
          `Please wait ${res.retryAfterSeconds}s before requesting another code.`,
          { retryAfterSeconds: res.retryAfterSeconds },
        );
      }
      return generic;
    },

    async getWhoAmI(userId: string): Promise<{ email: string; emailVerified: boolean }> {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, emailVerified: true, status: true },
      });
      if (!user) throw new AppError('UNAUTHENTICATED');
      if (user.status === 'suspended') throw new AppError('ACCOUNT_SUSPENDED');
      return { email: user.email, emailVerified: user.emailVerified };
    },

    async changeEmail(
      userId: string,
      newEmailInput: string,
    ): Promise<{ email: string; emailVerified: false; verificationToken: string }> {
      const newEmail = newEmailInput.toLowerCase().trim();
      const current = now();
      const existing = await prisma.user.findUnique({ where: { id: userId } });
      if (!existing) throw new AppError('UNAUTHENTICATED');
      if (existing.status === 'suspended') throw new AppError('ACCOUNT_SUSPENDED');

      if (existing.email !== newEmail) {
        const taken = await prisma.user.findUnique({ where: { email: newEmail } });
        if (taken) throw new AppError('EMAIL_TAKEN');
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: current },
        });
        await tx.otpCode.updateMany({
          where: { userId, purpose: 'verify_email', usedAt: null },
          data: { usedAt: current },
        });
        return tx.user.update({
          where: { id: userId },
          data: {
            email: newEmail,
            emailVerified: false,
            tokensValidAfter: current,
          },
        });
      });

      await createAndSendVerificationOtp(updated, false);
      const { token: verificationToken } = signAccessToken(
        updated.id,
        env.JWT_SECRET,
        900,
        'verify_only',
      );
      return { email: updated.email, emailVerified: false, verificationToken };
    },

    async cleanupExpiredOtpsAndUnverifiedUsers(): Promise<{
      deletedOtps: number;
      deletedUsers: number;
    }> {
      const current = now();
      const cutoff24h = new Date(current.getTime() - 24 * 60 * 60 * 1000);
      const [otps, users] = await Promise.all([
        prisma.otpCode.deleteMany({ where: { expiresAt: { lt: current } } }),
        prisma.user.deleteMany({
          where: { emailVerified: false, createdAt: { lt: cutoff24h } },
        }),
      ]);
      return { deletedOtps: otps.count, deletedUsers: users.count };
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
