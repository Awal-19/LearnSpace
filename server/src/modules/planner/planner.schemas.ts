import { z } from 'zod';

const reminderOffsetSchema = z.union([
  z.literal(0),
  z.literal(60),
  z.literal(1440),
  z.null(),
]);

export const listTasksQuerySchema = z.object({
  view: z.enum(['today', 'upcoming', 'overdue', 'done', 'all']).default('all'),
  courseId: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1, 'Task title is required').max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    courseId: z.string().uuid().nullable().optional(),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    priority: z.enum(['low', 'medium', 'high']).default('medium'),
    reminderOffsetMinutes: reminderOffsetSchema.optional().default(null),
  })
  .refine((data) => data.reminderOffsetMinutes === null || Boolean(data.dueAt), {
    message: 'A due date is required to set a reminder',
    path: ['reminderOffsetMinutes'],
  });

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, 'Task title is required').max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  courseId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  status: z.enum(['todo', 'done']).optional(),
  reminderOffsetMinutes: reminderOffsetSchema.optional(),
});

export const listNotificationsQuerySchema = z.object({
  unread: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});

export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;
export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

