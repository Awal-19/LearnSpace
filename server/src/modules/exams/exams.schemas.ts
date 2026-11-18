import { z } from 'zod';

export const EXAM_TYPES = ['midterm', 'final', 'quiz', 'practical', 'oral', 'other'] as const;
export const PREFERRED_TIMES = ['morning', 'afternoon', 'evening', 'night'] as const;
export const REVISION_SESSION_STATUSES = ['planned', 'completed', 'missed', 'rescheduled'] as const;

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD date format');
const timeStringSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm 24-hour time format');

const optionalVenue = z
  .union([z.string().trim().max(120), z.null()])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    return val;
  });

const optionalNotes = z
  .union([z.string().trim().max(2000), z.null()])
  .optional()
  .transform((val) => {
    if (val === undefined) return undefined;
    if (val === null || val === '') return null;
    return val;
  });

const topicsArraySchema = z
  .array(z.string().trim().min(1).max(120))
  .max(50)
  .transform((items) => Array.from(new Set(items)));

export const createExamSchema = z
  .object({
    courseId: z.string().uuid('Select a valid course'),
    title: z.string().trim().min(1, 'Exam title is required').max(160),
    examType: z.enum(EXAM_TYPES).default('final'),
    startsAt: z.string().datetime({ offset: true }),
    durationMinutes: z.coerce.number().int().min(5).max(720).nullable().optional(),
    venue: optionalVenue,
    weightPercent: z.coerce.number().min(0).max(100).nullable().optional(),
    topics: topicsArraySchema.default([]),
    notes: optionalNotes,
  })
  .strict();

export const updateExamSchema = z
  .object({
    courseId: z.string().uuid('Select a valid course').optional(),
    title: z.string().trim().min(1, 'Exam title is required').max(160).optional(),
    examType: z.enum(EXAM_TYPES).optional(),
    startsAt: z.string().datetime({ offset: true }).optional(),
    durationMinutes: z.coerce.number().int().min(5).max(720).nullable().optional(),
    venue: optionalVenue,
    weightPercent: z.coerce.number().min(0).max(100).nullable().optional(),
    topics: topicsArraySchema.optional(),
    notes: optionalNotes,
  })
  .strict();

export const listExamsQuerySchema = z.object({
  courseId: z.string().uuid().optional(),
  upcoming: z.enum(['true', 'false']).optional(),
});

export const generateRevisionPlanSchema = z
  .object({
    examIds: z.array(z.string().uuid()).max(20).optional(),
    title: z.string().trim().min(1).max(160).optional(),
    startDate: dateStringSchema.optional(),
    endDate: dateStringSchema.optional(),
    hoursPerDay: z.coerce.number().min(0.5).max(12).default(2),
    daysOff: z
      .array(z.coerce.number().int().min(0).max(6))
      .max(6)
      .default([])
      .transform((arr) => Array.from(new Set(arr)).sort()),
    preferredTimes: z
      .array(z.enum(PREFERRED_TIMES))
      .min(1)
      .max(4)
      .default(['evening'])
      .transform((arr) => Array.from(new Set(arr))),
    instructions: z.string().trim().max(500).optional(),
  })
  .strict();

export const aiRevisionPlanOutputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  sessions: z
    .array(
      z.object({
        scheduledDate: dateStringSchema,
        startTime: timeStringSchema,
        durationMinutes: z.coerce.number().int().min(15).max(360),
        courseId: z.string().uuid().nullable().optional(),
        examId: z.string().uuid().nullable().optional(),
        topic: z.string().trim().min(1).max(200),
        notes: z.string().trim().max(1000).nullable().optional(),
      }),
    )
    .min(1)
    .max(120),
});

export const saveRevisionPlanSchema = z
  .object({
    title: z.string().trim().min(1, 'Plan title is required').max(160),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    hoursPerDay: z.coerce.number().min(0.5).max(12),
    daysOff: z.array(z.coerce.number().int().min(0).max(6)).max(6).default([]),
    preferredTimes: z.array(z.enum(PREFERRED_TIMES)).min(1).max(4).default(['evening']),
    sessions: z
      .array(
        z.object({
          scheduledDate: dateStringSchema,
          startTime: timeStringSchema,
          durationMinutes: z.coerce.number().int().min(15).max(360),
          examId: z.string().uuid().nullable().optional(),
          courseId: z.string().uuid().nullable().optional(),
          topic: z.string().trim().min(1).max(200),
          notes: z
            .union([z.string().trim().max(1000), z.null()])
            .optional()
            .transform((v) => (v === undefined || v === null || v === '' ? null : v)),
          status: z.enum(REVISION_SESSION_STATUSES).optional(),
        }),
      )
      .min(1, 'Add at least one revision session before saving')
      .max(120),
  })
  .strict()
  .refine((d) => d.endDate >= d.startDate, {
    message: 'End date must be on or after start date',
    path: ['endDate'],
  });

export const updateRevisionSessionSchema = z
  .object({
    scheduledDate: dateStringSchema.optional(),
    startTime: timeStringSchema.optional(),
    durationMinutes: z.coerce.number().int().min(15).max(360).optional(),
    topic: z.string().trim().min(1).max(200).optional(),
    notes: z
      .union([z.string().trim().max(1000), z.null()])
      .optional()
      .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : v)),
    status: z.enum(REVISION_SESSION_STATUSES).optional(),
  })
  .strict();

export type CreateExamInput = z.infer<typeof createExamSchema>;
export type UpdateExamInput = z.infer<typeof updateExamSchema>;
export type ListExamsQuery = z.infer<typeof listExamsQuerySchema>;
export type GenerateRevisionPlanInput = z.infer<typeof generateRevisionPlanSchema>;
export type SaveRevisionPlanInput = z.infer<typeof saveRevisionPlanSchema>;
export type UpdateRevisionSessionInput = z.infer<typeof updateRevisionSessionSchema>;
