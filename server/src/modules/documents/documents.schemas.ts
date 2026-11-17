import { z } from 'zod';

export const documentTypeSchema = z.enum(['past_question', 'slides', 'notes']);

export const uploadDocumentMetaSchema = z.object({
  type: documentTypeSchema,
  title: z.string().trim().min(1).max(200).optional(),
  courseId: z.string().uuid().optional().nullable(),
});

export const listDocumentsQuerySchema = z.object({
  type: documentTypeSchema.optional(),
  courseId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const detectedQuestionItemSchema = z.object({
  section: z.string().trim().max(120).nullable().optional(),
  questionNumber: z.string().trim().min(1).max(40),
  prompt: z.string().trim().min(1).max(8000),
  marks: z.number().int().min(1).max(500).nullable().optional(),
  instructions: z.string().trim().max(1000).nullable().optional(),
  unclear: z.boolean().optional().default(false),
  unclearReason: z.string().trim().max(500).nullable().optional(),
});

export const detectedQuestionsJsonSchema = z.object({
  questions: z.array(detectedQuestionItemSchema),
});

export const patchQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        id: z.string().uuid().optional(),
        section: z.string().trim().max(120).nullable().optional(),
        questionNumber: z.string().trim().min(1).max(40),
        prompt: z.string().trim().min(1).max(8000),
        marks: z.number().int().min(1).max(500).nullable().optional(),
        instructions: z.string().trim().max(1000).nullable().optional(),
        unclear: z.boolean().optional().default(false),
        unclearReason: z.string().trim().max(500).nullable().optional(),
        selected: z.boolean().optional().default(true),
      }),
    )
    .max(150),
});

export const answerQuestionSchema = z.object({
  mode: z.enum(['full_worked', 'answers_only', 'marking_scheme']).default('full_worked'),
  useCourseNotes: z.boolean().default(true),
  refinement: z.enum(['regenerate', 'simpler', 'another_method']).optional(),
});

export const exportDocumentSchema = z.object({
  format: z.enum(['pdf', 'docx']),
});

export const saveToNotesSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  courseId: z.string().uuid().nullable().optional(),
});

export const generatedQuestionTypeSchema = z.enum([
  'mcq',
  'true_false',
  'short_answer',
  'essay',
  'fill_blank',
  'calculation',
  'flashcard',
]);

export const generateQuestionsSchema = z.object({
  types: z.array(generatedQuestionTypeSchema).min(1).max(7),
  count: z.number().int().min(1).max(30).default(10),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('mixed'),
  scope: z.enum(['whole', 'pages', 'topic']).default('whole'),
  selectedPages: z.array(z.number().int().min(1)).max(200).optional(),
  topic: z.string().trim().max(160).optional(),
  style: z.enum(['exam', 'quick_revision']).default('exam'),
  title: z.string().trim().min(1).max(200).optional(),
});

export const generatedQuestionItemSchema = z.object({
  type: generatedQuestionTypeSchema,
  difficulty: z.enum(['easy', 'medium', 'hard']),
  topic: z.string().trim().min(1).max(160),
  prompt: z.string().trim().min(1).max(4000),
  options: z.array(z.string().trim().min(1).max(1000)).max(6).nullable().optional(),
  correctAnswer: z.string().trim().min(1).max(4000),
  explanation: z.string().trim().min(1).max(4000),
  sourceRef: z.string().trim().min(1).max(120),
});

export const generatedSetJsonSchema = z.object({
  questions: z.array(generatedQuestionItemSchema).min(1),
});

export const refineGeneratedQuestionSchema = z.object({
  action: z.enum(['regenerate', 'harder', 'easier', 'more_on_topic']),
});

export const submitPracticeAttemptSchema = z.object({
  answers: z.record(z.string().uuid(), z.string().max(8000)),
});

export const saveSetToLibrarySchema = z.object({
  target: z.enum(['quiz', 'deck', 'both']).default('both'),
  title: z.string().trim().min(1).max(150).optional(),
});

export const gradeOpenAnswersJsonSchema = z.object({
  results: z.array(
    z.object({
      questionId: z.string().uuid(),
      correct: z.boolean(),
      feedback: z.string().trim().min(1).max(2000),
    }),
  ),
});

export interface DocumentPage {
  index: number;
  label: string;
  text: string;
  hasImages: boolean;
}

export interface DocumentChunk {
  chunkIndex: number;
  pageRange: string;
  text: string;
  pages: DocumentPage[];
}

export const DEFAULT_CHUNK_CHARS = 10_000;

/**
 * Splits extracted pages/slides into context-bounded chunks so large documents
 * can be processed in parts without overflowing the model's context window.
 */
export function chunkDocumentPages(
  pages: DocumentPage[],
  maxChunkChars = DEFAULT_CHUNK_CHARS,
): DocumentChunk[] {
  if (pages.length === 0) return [];

  const chunks: DocumentChunk[] = [];
  let currentPages: DocumentPage[] = [];
  let currentChars = 0;

  const flush = () => {
    if (currentPages.length === 0) return;
    const first = currentPages[0]!;
    const last = currentPages[currentPages.length - 1]!;
    const pageRange = first.label === last.label ? first.label : `${first.label} - ${last.label}`;
    const text = currentPages
      .map((p) => `--- ${p.label} ---\n${p.text}`)
      .join('\n\n')
      .trim();
    chunks.push({
      chunkIndex: chunks.length,
      pageRange,
      text,
      pages: currentPages,
    });
    currentPages = [];
    currentChars = 0;
  };

  for (const page of pages) {
    const formattedLen = page.label.length + page.text.length + 12;
    if (currentPages.length > 0 && currentChars + formattedLen > maxChunkChars) {
      flush();
    }
    if (formattedLen > maxChunkChars && currentPages.length === 0) {
      // Single very dense page/section: split into sub-slices while keeping its label.
      const text = page.text;
      let offset = 0;
      let part = 1;
      while (offset < text.length) {
        const slice = text.slice(offset, offset + maxChunkChars);
        chunks.push({
          chunkIndex: chunks.length,
          pageRange: `${page.label} (part ${part})`,
          text: `--- ${page.label} (part ${part}) ---\n${slice}`,
          pages: [{ ...page, text: slice }],
        });
        offset += maxChunkChars;
        part += 1;
      }
      continue;
    }

    currentPages.push(page);
    currentChars += formattedLen;
  }

  flush();
  return chunks;
}

