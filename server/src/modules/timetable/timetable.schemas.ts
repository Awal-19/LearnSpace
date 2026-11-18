import { z } from 'zod';

export const TIMETABLE_ENTRY_TYPES = ['lecture', 'lab', 'tutorial', 'seminar'] as const;

const optionalVenue = z
  .union([z.string().trim().max(120), z.null()])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    return val;
  });

export const createTimetableSchema = z
  .object({
    courseId: z.string().uuid('Select a valid course'),
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    startMinute: z.coerce.number().int().min(0).max(1439),
    endMinute: z.coerce.number().int().min(1).max(1440),
    venue: optionalVenue,
    type: z.enum(TIMETABLE_ENTRY_TYPES).default('lecture'),
    reminderEnabled: z.boolean().default(true),
    reminderMinutes: z.coerce.number().int().min(0).max(1440).nullable().optional(),
  })
  .strict()
  .refine((d) => d.endMinute > d.startMinute, {
    message: 'End time must be after start time',
    path: ['endMinute'],
  });

export const updateTimetableSchema = z
  .object({
    courseId: z.string().uuid('Select a valid course').optional(),
    dayOfWeek: z.coerce.number().int().min(0).max(6).optional(),
    startMinute: z.coerce.number().int().min(0).max(1439).optional(),
    endMinute: z.coerce.number().int().min(1).max(1440).optional(),
    venue: optionalVenue,
    type: z.enum(TIMETABLE_ENTRY_TYPES).optional(),
    reminderEnabled: z.boolean().optional(),
    reminderMinutes: z.coerce.number().int().min(0).max(1440).nullable().optional(),
  })
  .strict()
  .refine(
    (d) => d.startMinute === undefined || d.endMinute === undefined || d.endMinute > d.startMinute,
    {
      message: 'End time must be after start time',
      path: ['endMinute'],
    },
  );

export type CreateTimetableInput = z.infer<typeof createTimetableSchema>;
export type UpdateTimetableInput = z.infer<typeof updateTimetableSchema>;
