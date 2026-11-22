import { z } from 'zod';

export const passwordPolicy = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().default(false),
});

export const TERMS_CONSENT_REQUIRED_MESSAGE =
  'Please accept the Terms and Conditions and Privacy Policy to continue.';

export const signupSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Name is required')
      .max(100, 'Name must be at most 100 characters'),
    email: z.string().trim().email('Enter a valid email address'),
    password: passwordPolicy,
    learnerType: z.enum(['university', 'shs']).default('university'),
    schoolYear: z.enum(['SHS 1', 'SHS 2', 'SHS 3']).optional(),
    ageGroup: z.enum(['adult_18_plus', 'under_18']).default('adult_18_plus'),
    dateOfBirth: z.string().optional(),
    guardianEmail: z
      .string()
      .trim()
      .email('Enter a valid guardian email address')
      .optional()
      .or(z.literal('')),
    guardianPhone: z.string().trim().max(30).optional().or(z.literal('')),
    acceptTerms: z.boolean().refine((value) => value === true, {
      message: TERMS_CONSENT_REQUIRED_MESSAGE,
    }),
  })
  .superRefine((data, ctx) => {
    if (data.ageGroup === 'under_18' && !data.guardianEmail?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['guardianEmail'],
        message: 'A parent or guardian email is required for students under 18.',
      });
    }
  });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
});

export const resetPasswordSchema = z
  .object({
    password: passwordPolicy,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type LoginValues = z.infer<typeof loginSchema>;
export type SignupValues = z.infer<typeof signupSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
