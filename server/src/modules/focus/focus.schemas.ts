import { z } from 'zod';

export const createStudySessionSchema = z.object({
  startedAt: z.string().datetime({ offset: true }),
  durationSeconds: z
    .number()
    .int()
    .min(60, 'Session must be at least 60 seconds')
    .max(14400, 'Session cannot exceed 4 hours'),
  source: z.enum(['pomodoro', 'manual']).default('pomodoro'),
  taskId: z.string().uuid().nullable().optional(),
  courseId: z.string().uuid().nullable().optional(),
});

export const listStudySessionsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  courseId: z.union([z.literal('none'), z.string().uuid()]).optional(),
});

export type CreateStudySessionInput = z.infer<typeof createStudySessionSchema>;
export type ListStudySessionsQuery = z.infer<typeof listStudySessionsQuerySchema>;
