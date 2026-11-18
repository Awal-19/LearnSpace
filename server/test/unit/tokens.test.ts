import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import {
  generateOpaqueToken,
  hashToken,
  signAccessToken,
  verifyAccessToken,
} from '../../src/lib/tokens';

const SECRET = 'test-secret-test-secret-test-secret-123';

describe('tokens (T-AUTH-09)', () => {
  it('signs and verifies an access token', () => {
    const { token, expiresIn } = signAccessToken('user-1', SECRET);
    expect(expiresIn).toBe(900);
    const payload = verifyAccessToken(token, SECRET);
    expect(payload.userId).toBe('user-1');
  });

  it('throws TOKEN_EXPIRED when the token is expired', () => {
    const expired = jwt.sign({ sub: 'user-1' }, SECRET, { algorithm: 'HS256', expiresIn: -10 });
    expect(() => verifyAccessToken(expired, SECRET)).toThrowError(
      expect.objectContaining({ code: 'TOKEN_EXPIRED' }),
    );
  });

  it('throws UNAUTHENTICATED when tampered', () => {
    const { token } = signAccessToken('user-1', SECRET);
    const tampered = `${token.slice(0, -4)}xxxx`;
    expect(() => verifyAccessToken(tampered, SECRET)).toThrowError(
      expect.objectContaining({ code: 'UNAUTHENTICATED' }),
    );
  });

  it('generates opaque tokens whose SHA-256 hash matches hashToken()', () => {
    const { raw, hash } = generateOpaqueToken();
    expect(raw.length).toBeGreaterThanOrEqual(32);
    expect(hash).toBe(hashToken(raw));
  });
});
