import { createHash, randomBytes, randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AppError } from './errors';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const REFRESH_TTL_SESSION_MS = 24 * 60 * 60 * 1000; // 24 hours
export const REFRESH_TTL_PERSISTENT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface AccessTokenPayload {
  userId: string;
  iat?: number;
}

export function signAccessToken(
  userId: string,
  secret: string,
): { token: string; expiresIn: number } {
  const token = jwt.sign({}, secret, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    jwtid: randomUUID(),
  });
  return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || !decoded.sub) {
      throw new AppError('UNAUTHENTICATED');
    }
    return { userId: decoded.sub, iat: decoded.iat };
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

