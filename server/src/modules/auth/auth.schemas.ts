import { z } from 'zod';
import { passwordSchema } from '../../lib/password';

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .max(254, 'Email is too long');

// eslint-disable-next-line no-control-regex
const noControlChars = (val: string) => !/[\u0000-\u001F\u007F]/.test(val);

export const signupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Name must be at most 100 characters')
      .refine(noControlChars, 'Invalid characters in name'),
    email: emailSchema,
    password: passwordSchema,
    timezone: z.string().trim().max(64).optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required').max(128),
    rememberMe: z.boolean().optional().default(false),
  })
  .strict();

export const verifyEmailSchema = z
  .object({
    token: z.string().trim().min(10, 'Invalid token').max(256),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(10, 'Invalid token').max(256),
    password: passwordSchema,
  })
  .strict();

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

