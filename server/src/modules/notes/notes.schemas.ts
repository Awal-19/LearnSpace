import { z } from 'zod';

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex code like #6366F1');

export const createCourseSchema = z.object({
  name: z.string().trim().min(1, 'Course name is required').max(80),
  color: hexColorSchema.optional(),
});

export const updateCourseSchema = z.object({
  name: z.string().trim().min(1, 'Course name is required').max(80).optional(),
  color: z.union([hexColorSchema, z.null()]).optional(),
});

export const listNotesQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  courseId: z.string().trim().optional(),
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

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type ListNotesQuery = z.infer<typeof listNotesQuerySchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

