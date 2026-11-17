import { z } from 'zod';

export const overviewQuerySchema = z.object({
  range: z.enum(['7d', '30d', '90d', 'custom']).default('30d'),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const listUsersQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(['student', 'admin', 'super_admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  verified: z.enum(['true', 'false']).optional(),
  authMethod: z.enum(['email', 'google']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  sortBy: z.enum(['createdAt', 'name', 'email', 'lastActiveAt']).default('createdAt'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const updateUserStatusSchema = z
  .object({
    status: z.enum(['active', 'suspended']),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const updateUserRoleSchema = z
  .object({
    role: z.enum(['student', 'admin', 'super_admin']),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const bulkUsersSchema = z
  .object({
    action: z.enum(['suspend', 'export_csv']),
    userIds: z.array(z.string().uuid()).min(1).max(200),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const uuidParamSchema = z.string().uuid();

export const inspectContentSchema = z
  .object({
    reason: z.string().trim().min(5, 'Please provide a moderation reason (at least 5 characters)').max(500),
  })
  .strict();

export const resolveFlagSchema = z
  .object({
    status: z.enum(['dismissed', 'warned', 'suspended']),
    reviewNote: z.string().trim().max(1000).optional(),
  })
  .strict();

export const updateAiLimitsSchema = z
  .object({
    dailyMessageLimit: z.number().int().min(1).max(10_000).optional(),
    maxUploadBytes: z.number().int().min(1024 * 1024).max(100 * 1024 * 1024).optional(),
    dailyUploadQuota: z.number().int().min(1).max(1000).optional(),
    dailyCostAlertUsd: z.number().min(0.1).max(10_000).optional(),
  })
  .strict();

export const paginationQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.string().trim().max(40).optional(),
  action: z.string().trim().max(120).optional(),
  suspicious: z.enum(['true', 'false']).optional(),
  format: z.enum(['json', 'csv']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createAnnouncementSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    message: z.string().trim().min(2).max(4000),
    audience: z.enum(['all', 'programme', 'level']).default('all'),
    audienceValue: z.string().trim().max(120).optional().nullable(),
    scheduledAt: z.string().datetime().optional().nullable(),
    sendEmail: z.boolean().default(false),
  })
  .strict();

export const updateAnnouncementSchema = z
  .object({
    active: z.boolean().optional(),
    title: z.string().trim().min(2).max(160).optional(),
    message: z.string().trim().min(2).max(4000).optional(),
  })
  .strict();

export const updateFeedbackSchema = z
  .object({
    status: z.enum(['new', 'in_progress', 'resolved']),
    adminNotes: z.string().trim().max(2000).optional().nullable(),
  })
  .strict();

export const replyFeedbackSchema = z
  .object({
    message: z.string().trim().min(2).max(4000),
  })
  .strict();

export const updateAppSettingsSchema = z
  .object({
    appName: z.string().trim().min(1).max(100).optional(),
    supportEmail: z.string().trim().email().max(200).optional(),
    maintenanceMode: z.boolean().optional(),
    maintenanceMessage: z.string().trim().min(1).max(500).optional(),
    featureChat: z.boolean().optional(),
    featureUploads: z.boolean().optional(),
    featureDocuments: z.boolean().optional(),
    featureSignups: z.boolean().optional(),
    dailyMessageLimit: z.number().int().min(1).max(10_000).optional(),
    maxUploadBytes: z.number().int().min(1024 * 1024).max(100 * 1024 * 1024).optional(),
    dailyUploadQuota: z.number().int().min(1).max(1000).optional(),
    dailyCostAlertUsd: z.number().min(0.1).max(10_000).optional(),
    allowedFileTypesJson: z.array(z.string().trim().min(1).max(20)).max(20).optional(),
  })
  .strict();

export const createExportSchema = z
  .object({
    kind: z.enum(['users', 'usage', 'ai_costs', 'feedback', 'overview_pdf']),
    from: z.string().optional(),
    to: z.string().optional(),
  })
  .strict();

export const studentFeedbackSchema = z
  .object({
    category: z.enum(['bug', 'suggestion', 'abuse']),
    subject: z.string().trim().min(2).max(160),
    message: z.string().trim().min(5).max(4000),
  })
  .strict();

export const studentFlagMessageSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict();


export const adminPermissionsSchema = z
  .object({
    can_manage_users: z.boolean().optional(),
    can_moderate_content: z.boolean().optional(),
    can_view_ai_usage: z.boolean().optional(),
    can_send_announcements: z.boolean().optional(),
    can_export_data: z.boolean().optional(),
  })
  .strict();

export const inviteAdminSchema = z
  .object({
    email: z.string().trim().email().max(254),
    role: z.enum(['admin', 'super_admin']).default('admin'),
    permissions: adminPermissionsSchema.optional(),
  })
  .strict();

export const updateAdminPermissionsSchema = z
  .object({
    permissions: adminPermissionsSchema,
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const updatePlatformSettingsSchema = updateAppSettingsSchema
  .extend({
    featureGoogleLogin: z.boolean().optional(),
    maintenanceAllowlistJson: z.array(z.string().trim().email().max(254)).max(50).optional(),
    monthlyCostCapUsd: z.number().min(1).max(100_000).optional(),
    sessionLifetimeMinutes: z.number().int().min(15).max(43_200).optional(),
    minPasswordLength: z.number().int().min(8).max(32).optional(),
    requireEmailVerification: z.boolean().optional(),
    requireAdminOtp: z.boolean().optional(),
    maxLoginAttempts: z.number().int().min(3).max(20).optional(),
    lockoutMinutes: z.number().int().min(1).max(1440).optional(),
    aiModel: z.string().trim().min(1).max(120).optional(),
    aiSystemPromptVersion: z.string().trim().min(1).max(40).optional(),
    aiMaxTokens: z.number().int().min(128).max(32_768).optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

export const rollbackSettingsSchema = z
  .object({
    version: z.number().int().min(1),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const stepUpVerifySchema = z
  .object({
    password: z.string().min(1).max(200).optional(),
    code: z.string().trim().length(6).optional(),
  })
  .strict();

export const acceptAdminInviteSchema = z
  .object({
    token: z.string().min(10).max(200),
    name: z.string().trim().min(1).max(100).optional(),
    password: z.string().min(8).max(200),
  })
  .strict();
