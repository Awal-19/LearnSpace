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

export const CURRENT_TERMS_VERSION = '2026-11-18';
export const CURRENT_PRIVACY_POLICY_VERSION = '2026-11-18';
export const TERMS_CONSENT_REQUIRED_MESSAGE =
  'Please accept the Terms and Conditions and Privacy Policy to continue.';

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
    acceptTerms: z
      .boolean({
        required_error: TERMS_CONSENT_REQUIRED_MESSAGE,
        invalid_type_error: TERMS_CONSENT_REQUIRED_MESSAGE,
      })
      .refine((value) => value === true, {
        message: TERMS_CONSENT_REQUIRED_MESSAGE,
      }),
    captchaToken: z.string().trim().max(4096).optional(),
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

export const adminTwoFactorSchema = z
  .object({
    email: emailSchema,
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Enter the 6-digit verification code'),
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

export const verifyOtpSchema = z
  .object({
    email: emailSchema,
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'Enter the 6-digit verification code'),
  })
  .strict();

export const resendOtpSchema = z
  .object({
    email: emailSchema,
    captchaToken: z.string().trim().max(4096).optional(),
  })
  .strict();

export const changeEmailSchema = z
  .object({
    email: emailSchema,
  })
  .strict();
