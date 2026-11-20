import { z } from 'zod';

export const accessTypeSchema = z.enum(['free', 'preview', 'borrow', 'paid']);
export const categorySchema = z.enum(['book', 'past_question', 'video', 'notes']);

export const llmBookItemSchema = z.object({
  title: z.string().trim().min(2).max(240),
  authors: z.string().trim().max(240).nullable().optional(),
  edition: z.string().trim().max(80).nullable().optional(),
  year: z.coerce.number().int().min(1900).max(2100).nullable().optional(),
  reason: z.string().trim().min(5).max(600),
  topics: z.array(z.string().trim().min(1).max(80)).max(8).default([]),
  url: z.string().trim().url().max(1200),
  accessType: accessTypeSchema,
  sourceSite: z.string().trim().min(1).max(120),
  relevanceScore: z.coerce.number().min(0).max(100).default(70),
});

export const llmPastQuestionItemSchema = z.object({
  title: z.string().trim().min(2).max(240),
  institutionOrBody: z.string().trim().max(180).nullable().optional(),
  year: z.coerce.number().int().min(1950).max(2100).nullable().optional(),
  paperType: z.enum(['past_paper', 'quiz', 'assignment', 'practice_set']).default('past_paper'),
  reason: z.string().trim().min(5).max(600),
  url: z.string().trim().url().max(1200),
  accessType: accessTypeSchema.default('free'),
  sourceSite: z.string().trim().min(1).max(120),
  relevanceScore: z.coerce.number().min(0).max(100).default(70),
});

export const llmExtraItemSchema = z.object({
  category: z.enum(['video', 'notes']),
  title: z.string().trim().min(2).max(240),
  authors: z.string().trim().max(240).nullable().optional(),
  year: z.coerce.number().int().min(1990).max(2100).nullable().optional(),
  reason: z.string().trim().min(5).max(600),
  url: z.string().trim().url().max(1200),
  accessType: accessTypeSchema.default('free'),
  sourceSite: z.string().trim().min(1).max(120),
  relevanceScore: z.coerce.number().min(0).max(100).default(65),
});

export const llmRecommendationsOutputSchema = z.object({
  books: z.array(llmBookItemSchema).max(12).default([]),
  pastQuestions: z.array(llmPastQuestionItemSchema).max(10).default([]),
  extras: z.array(llmExtraItemSchema).max(8).default([]),
  pastQuestionsNote: z.string().trim().max(400).nullable().optional(),
});

export type LlmRecommendationsOutput = z.infer<typeof llmRecommendationsOutputSchema>;

export const refreshRecommendationsSchema = z
  .object({
    mode: z.enum(['refresh', 'find_more']).default('refresh'),
    force: z.boolean().default(false),
  })
  .strict();

export const reportRecommendationSchema = z
  .object({
    reason: z.string().trim().min(3, 'Please tell us what is wrong with this link').max(500),
  })
  .strict();

export const updateAssistantResourcesToggleSchema = z
  .object({
    useResourcesInAssistant: z.boolean(),
  })
  .strict();
