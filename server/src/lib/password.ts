import argon2 from 'argon2';
import { z } from 'zod';

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password12',
  'password123',
  'password1234',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty123',
  'qwerty1234',
  'qwertyuiop1',
  'letmein1',
  'letmein123',
  'welcome1',
  'welcome123',
  'admin123',
  'admin1234',
  'administrator1',
  'iloveyou1',
  'iloveyou123',
  'passw0rd',
  'p@ssword1',
  'p@ssw0rd1',
  'abc12345',
  'abcd1234',
  'abcdef12',
  'football1',
  'baseball1',
  'soccer123',
  'basketball1',
  'sunshine1',
  'princess1',
  'dragon123',
  'monkey123',
  'trustno1',
  'superman1',
  'batman123',
  'master123',
  'shadow123',
  'ashley123',
  'charlie1',
  'michael1',
  'jordan23',
  'qazwsx123',
  '1qaz2wsx',
  'zaq12wsx',
  'pass1234',
  'login123',
  'changeme1',
  'learnspace1',
  'student123',
  'college123',
  'university1',
  'summer2024',
  'summer2025',
  'winter2024',
  'winter2025',
  'test1234',
  'testing123',
]);

/** Shared password policy (SRS AUTH-2, SECURITY.md section 3). */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must include at least one letter')
  .regex(/[0-9]/, 'Password must include at least one number')
  .refine((val) => !COMMON_PASSWORDS.has(val.toLowerCase()), 'Choose a less common password');

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB (OWASP minimum)
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
