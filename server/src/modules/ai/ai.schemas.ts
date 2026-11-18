import { z } from 'zod';

export const listConversationsQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  courseId: z.union([z.literal('none'), z.string().uuid()]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  courseId: z.string().uuid().nullable().optional(),
});

export const getConversationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().uuid().optional(),
});

export const renameConversationSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title is required')
      .max(120, 'Title must be 120 characters or fewer')
      .optional(),
    courseId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => d.title !== undefined || d.courseId !== undefined, {
    message: 'Provide a title or courseId to update',
  });

export const aiActionSchema = z.enum(['explain_simple', 'example', 'quiz_me', 'summarize']);

export const sendMessageSchema = z
  .object({
    content: z.string().trim().max(8000, 'Message must be 8000 characters or fewer').default(''),
    action: aiActionSchema.nullable().optional().default(null),
    selection: z.string().trim().max(4000).optional(),
    attachmentIds: z
      .array(z.string().uuid())
      .max(5, 'Maximum 5 attachments per message')
      .optional()
      .default([]),
  })
  .refine(
    (data) => data.content.length >= 1 || data.action !== null || data.attachmentIds.length > 0,
    {
      message: 'Enter a message, attach a file, or choose a quick action',
      path: ['content'],
    },
  );

export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type GetConversationQuery = z.infer<typeof getConversationQuerySchema>;
export type RenameConversationInput = z.infer<typeof renameConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
