import { z } from 'zod';

export const courseFilterQuerySchema = z.union([z.literal('none'), z.string().uuid()]).optional();

export const listNotesQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  courseId: courseFilterQuerySchema,
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});

export const createNoteSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200),
  body: z.string().max(100_000).default(''),
  courseId: z.string().uuid().nullable().optional(),
});

export const updateNoteSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200).optional(),
  body: z.string().max(100_000).optional(),
  courseId: z.string().uuid().nullable().optional(),
  aiSummary: z.string().max(10_000).nullable().optional(),
});

export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
