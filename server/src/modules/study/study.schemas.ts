import { z } from 'zod';

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});

export const createDeckSchema = z.object({
  title: z.string().trim().min(1, 'Deck title is required').max(150),
  topic: z.string().trim().max(200).optional(),
  cards: z
    .array(
      z.object({
        front: z.string().trim().min(1).max(1000),
        back: z.string().trim().min(1).max(2000),
      }),
    )
    .max(50)
    .optional(),
});

export const generateDeckSchema = z
  .object({
    noteId: z.string().uuid().optional(),
    topic: z.string().trim().min(2).max(200).optional(),
    count: z.coerce.number().int().min(5).max(30).default(10),
  })
  .refine((d) => Boolean(d.noteId) !== Boolean(d.topic), {
    message: 'Provide either a note or a topic, not both',
  });

export const updateDeckSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(150),
});

export const createCardSchema = z.object({
  front: z.string().trim().min(1, 'Front text is required').max(1000),
  back: z.string().trim().min(1, 'Back text is required').max(2000),
});

export const updateCardSchema = z.object({
  front: z.string().trim().min(1).max(1000).optional(),
  back: z.string().trim().min(1).max(2000).optional(),
  position: z.number().int().min(0).optional(),
});

export const generateQuizSchema = z
  .object({
    noteId: z.string().uuid().optional(),
    topic: z.string().trim().min(2).max(200).optional(),
    count: z.coerce.number().int().min(5).max(20).default(8),
  })
  .refine((d) => Boolean(d.noteId) !== Boolean(d.topic), {
    message: 'Provide either a note or a topic, not both',
  });

export const submitAttemptSchema = z.object({
  answers: z.array(z.union([z.number().int().min(0).max(3), z.null()])).min(1),
});

export const quizAttemptsRangeSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export const aiDeckOutputSchema = z.object({
  title: z.string().trim().min(1).max(150),
  cards: z
    .array(
      z.object({
        front: z.string().trim().min(1).max(1000),
        back: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1),
});

export const aiQuizOutputSchema = z.object({
  title: z.string().trim().min(1).max(150),
  questions: z
    .array(
      z.object({
        prompt: z.string().trim().min(1).max(1000),
        options: z.tuple([
          z.string().trim().min(1),
          z.string().trim().min(1),
          z.string().trim().min(1),
          z.string().trim().min(1),
        ]),
        correctIndex: z.number().int().min(0).max(3),
        explanation: z.string().trim().min(1).max(1000),
      }),
    )
    .min(1),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type CreateDeckInput = z.infer<typeof createDeckSchema>;
export type GenerateDeckInput = z.infer<typeof generateDeckSchema>;
export type UpdateDeckInput = z.infer<typeof updateDeckSchema>;
export type CreateCardInput = z.infer<typeof createCardSchema>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type GenerateQuizInput = z.infer<typeof generateQuizSchema>;
export type SubmitAttemptInput = z.infer<typeof submitAttemptSchema>;
export type QuizAttemptsRangeQuery = z.infer<typeof quizAttemptsRangeSchema>;

