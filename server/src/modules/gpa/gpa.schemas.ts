import { z } from 'zod';

export const gradeBoundarySchema = z
  .object({
    label: z.string().trim().min(1, 'Grade label is required').max(12),
    minScore: z.coerce.number().min(0).max(100),
    maxScore: z.coerce.number().min(0).max(100),
    gradePoint: z.coerce.number().min(0).max(10),
    isPass: z.boolean().default(true),
    excludeFromGpa: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.minScore <= b.maxScore, {
    message: 'Minimum score cannot exceed maximum score',
  });

export const degreeClassRuleSchema = z
  .object({
    label: z.string().trim().min(1, 'Class label is required').max(60),
    minGpa: z.coerce.number().min(0).max(10),
  })
  .strict();

export const createScaleSchema = z
  .object({
    name: z.string().trim().min(1, 'Scale name is required').max(100),
    maxGpa: z.coerce.number().gt(0).max(10).default(4.0),
    retakePolicy: z.enum(['latest', 'highest', 'include_all']).default('latest'),
    boundaries: z.array(gradeBoundarySchema).min(2).max(20),
    degreeClasses: z.array(degreeClassRuleSchema).min(1).max(10),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const updateScaleSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    maxGpa: z.coerce.number().gt(0).max(10).optional(),
    retakePolicy: z.enum(['latest', 'highest', 'include_all']).optional(),
    boundaries: z.array(gradeBoundarySchema).min(2).max(20).optional(),
    degreeClasses: z.array(degreeClassRuleSchema).min(1).max(10).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export const createGradeRecordSchema = z
  .object({
    courseId: z.string().uuid().nullable().optional(),
    scaleId: z.string().uuid().nullable().optional(),
    semester: z.string().trim().min(1, 'Semester is required').max(60),
    semesterOrder: z.coerce.number().int().min(1).max(50).default(1),
    courseCode: z.string().trim().min(1, 'Course code or short code is required').max(24),
    courseTitle: z.string().trim().min(1, 'Course title is required').max(120),
    creditHours: z.coerce.number().min(0, 'Credits cannot be negative').max(30),
    score: z.coerce.number().min(0).max(100).nullable().optional(),
    gradeLabel: z.string().trim().min(1).max(12).optional(),
    gradePoint: z.coerce.number().min(0).max(10).optional(),
    excludeFromGpa: z.boolean().optional(),
    isRetake: z.boolean().optional(),
    retakeGroupKey: z.string().trim().max(40).nullable().optional(),
  })
  .strict()
  .refine((d) => (d.score !== undefined && d.score !== null) || Boolean(d.gradeLabel), {
    message: 'Provide either a numeric score (0-100) or a grade label',
  });

export const updateGradeRecordSchema = z
  .object({
    courseId: z.string().uuid().nullable().optional(),
    scaleId: z.string().uuid().nullable().optional(),
    semester: z.string().trim().min(1).max(60).optional(),
    semesterOrder: z.coerce.number().int().min(1).max(50).optional(),
    courseCode: z.string().trim().min(1).max(24).optional(),
    courseTitle: z.string().trim().min(1).max(120).optional(),
    creditHours: z.coerce.number().min(0).max(30).optional(),
    score: z.coerce.number().min(0).max(100).nullable().optional(),
    gradeLabel: z.string().trim().min(1).max(12).optional(),
    gradePoint: z.coerce.number().min(0).max(10).optional(),
    excludeFromGpa: z.boolean().optional(),
    isRetake: z.boolean().optional(),
    retakeGroupKey: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

export const whatIfPlanSchema = z
  .object({
    targetCgpa: z.coerce.number().min(0).max(10).optional(),
    targetClassLabel: z.string().trim().min(1).max(60).optional(),
    remainingCredits: z.coerce.number().min(0).max(300).optional(),
    plannedCourses: z
      .array(
        z
          .object({
            label: z.string().trim().min(1).max(80),
            creditHours: z.coerce.number().min(0).max(30),
          })
          .strict(),
      )
      .max(20)
      .optional(),
  })
  .strict()
  .refine((d) => (d.targetCgpa !== undefined) !== Boolean(d.targetClassLabel), {
    message: 'Provide either targetCgpa or targetClassLabel',
  })
  .refine(
    (d) =>
      d.remainingCredits !== undefined ||
      (Array.isArray(d.plannedCourses) && d.plannedCourses.length > 0),
    { message: 'Provide remainingCredits or a list of plannedCourses' },
  );

export type CreateScaleInput = z.infer<typeof createScaleSchema>;
export type UpdateScaleInput = z.infer<typeof updateScaleSchema>;
export type CreateGradeRecordInput = z.infer<typeof createGradeRecordSchema>;
export type UpdateGradeRecordInput = z.infer<typeof updateGradeRecordSchema>;
export type WhatIfPlanInput = z.infer<typeof whatIfPlanSchema>;
