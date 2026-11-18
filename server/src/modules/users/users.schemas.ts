import { z } from 'zod';
import { passwordSchema } from '../../lib/password';

function optionalProfileText(max: number) {
  return z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined;
      if (val === null || val === '') return null;
      return val;
    });
}

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100).optional(),
  studentId: optionalProfileText(50),
  programme: optionalProfileText(120),
  level: optionalProfileText(30),
  university: optionalProfileText(120),
  bio: optionalProfileText(500),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200).optional(),
  newPassword: passwordSchema,
});

export const deleteAccountSchema = z
  .object({
    password: z.string().min(1).max(200).optional(),
    confirm: z.literal('DELETE').optional(),
  })
  .refine((data) => Boolean(data.password) || data.confirm === 'DELETE', {
    message: 'Provide your password or confirm with "DELETE"',
  });

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const updateSettingsSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  timezone: z.string().trim().min(1).max(64).refine(isValidTimezone, 'Invalid timezone').optional(),
  notifyInApp: z.boolean().optional(),
  notifyEmailReminders: z.boolean().optional(),
  notifyProductEmail: z.boolean().optional(),
  focusMinutes: z.number().int().min(1).max(120).optional(),
  shortBreakMinutes: z.number().int().min(1).max(60).optional(),
  longBreakMinutes: z.number().int().min(1).max(90).optional(),
  classReminderMinutes: z.number().int().min(0).max(1440).optional(),
  examReminderMinutes: z.number().int().min(0).max(10080).optional(),
});

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid hex color');

export const avatarConfigSchema = z.object({
  faceShape: z.enum(['oval', 'round', 'square', 'heart']),
  skinTone: hexColorSchema,
  hairStyle: z.enum([
    'short',
    'curly',
    'wavy',
    'long',
    'bob',
    'bun',
    'fade',
    'buzz',
    'hijabi',
    'none',
  ]),
  hairColor: hexColorSchema,
  eyes: z.enum(['calm', 'happy', 'focused', 'wink', 'glasses', 'lashes']),
  eyebrows: z.enum(['natural', 'arched', 'thick', 'soft']),
  nose: z.enum(['classic', 'button', 'defined', 'soft']),
  mouth: z.enum(['smile', 'grin', 'serene', 'smirk', 'open']),
  clothing: z.enum(['crewneck', 'hoodie', 'collar', 'blazer', 'turtleneck']),
  clothingColor: hexColorSchema,
  backgroundColor: hexColorSchema,
});

export type AvatarConfig = z.infer<typeof avatarConfigSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
