import { z } from 'zod';

export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a 6-digit hex code like #2563EB');

const optionalTrimmed = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string().trim().max(max).nullable().optional(),
  );

export const listCoursesQuerySchema = z.object({
  archived: z.enum(['active', 'archived', 'all']).default('active'),
  semester: z.string().trim().max(60).optional(),
});

export const createCourseSchema = z
  .object({
    name: z.string().trim().min(1, 'Course name is required').max(80),
    code: optionalTrimmed(24),
    lecturer: optionalTrimmed(120),
    creditHours: z.preprocess(
      (value) => (value === '' || value === undefined ? undefined : value),
      z.coerce
        .number({ invalid_type_error: 'Credit hours must be a number' })
        .min(0, 'Credit hours cannot be negative')
        .max(30, 'Credit hours must be 30 or fewer')
        .nullable()
        .optional(),
    ),
    semester: optionalTrimmed(60),
    level: optionalTrimmed(30),
    color: hexColorSchema.optional(),
    notes: optionalTrimmed(4000),
  })
  .strict();

export const updateCourseSchema = z
  .object({
    name: z.string().trim().min(1, 'Course name is required').max(80).optional(),
    code: optionalTrimmed(24),
    lecturer: optionalTrimmed(120),
    creditHours: z.preprocess(
      (value) => (value === '' ? null : value),
      z.coerce
        .number({ invalid_type_error: 'Credit hours must be a number' })
        .min(0, 'Credit hours cannot be negative')
        .max(30, 'Credit hours must be 30 or fewer')
        .nullable()
        .optional(),
    ),
    semester: optionalTrimmed(60),
    level: optionalTrimmed(30),
    color: z.union([hexColorSchema, z.null()]).optional(),
    notes: optionalTrimmed(4000),
    archived: z.boolean().optional(),
  })
  .strict();

export const deleteCourseQuerySchema = z.object({
  mode: z.enum(['unassign', 'delete']).default('unassign'),
});

export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;
export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type DeleteCourseQuery = z.infer<typeof deleteCourseQuerySchema>;
