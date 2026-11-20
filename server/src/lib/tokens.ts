import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppError } from './errors';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const ADMIN_ACCESS_TOKEN_TTL_SECONDS = 5 * 60; // 5 minutes for admin sessions
export const REFRESH_TTL_SESSION_MS = 24 * 60 * 60 * 1000; // 24 hours
export const ADMIN_REFRESH_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours for admin sessions
export const REFRESH_TTL_PERSISTENT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000; // 1 hour
export const ADMIN_2FA_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type TokenScope = 'full' | 'verify_only';

export interface AccessTokenPayload {
  userId: string;
  iat?: number;
  scope: TokenScope;
}

export function signAccessToken(
  userId: string,
  secret: string,
  expiresInSeconds = ACCESS_TOKEN_TTL_SECONDS,
  scope: TokenScope = 'full',
): { token: string; expiresIn: number } {
  const token = jwt.sign(scope === 'verify_only' ? { scope } : {}, secret, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn: expiresInSeconds,
    jwtid: randomUUID(),
  });
  return { token, expiresIn: expiresInSeconds };
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || !decoded.sub) {
      throw new AppError('UNAUTHENTICATED');
    }
    const scope: TokenScope = decoded.scope === 'verify_only' ? 'verify_only' : 'full';
    return { userId: decoded.sub, iat: decoded.iat, scope };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('TOKEN_EXPIRED');
    }
    throw new AppError('UNAUTHENTICATED');
  }
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateOpaqueToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

export const OTP_EXPIRY_MINUTES = 10;
export const OTP_TTL_MS = OTP_EXPIRY_MINUTES * 60 * 1000;
