import { describe, expect, it } from 'vitest';
import { hashPassword, passwordSchema, verifyPassword } from '../../src/lib/password';

describe('password policy and hashing (T-AUTH-01, T-AUTH-03)', () => {
  it('hashes with argon2id and verifies correctly', async () => {
    const hash = await hashPassword('StudyHard2026');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain('StudyHard2026');
    await expect(verifyPassword(hash, 'StudyHard2026')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'WrongPass123')).resolves.toBe(false);
  });

  it('rejects malformed hashes gracefully', async () => {
    await expect(verifyPassword('not-a-hash', 'StudyHard2026')).resolves.toBe(false);
  });

  it('enforces length, letter, number, and common-password rules', () => {
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('onlyletters').success).toBe(false);
    expect(passwordSchema.safeParse('123456789').success).toBe(false);
    expect(passwordSchema.safeParse('password123').success).toBe(false);
    expect(passwordSchema.safeParse('Passw0rdOK').success).toBe(true);
  });
});
