import type { Note, PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { AppError } from '../../lib/errors';
import type { LLMProvider } from '../../lib/llm/provider';
import type { CreateNoteInput, ListNotesQuery, UpdateNoteInput } from './notes.schemas';

export interface PublicNote {
  id: string;
  title: string;
  body: string;
  courseId: string | null;
  aiSummary: string | null;
  snippet?: string;
  createdAt: Date;
  updatedAt: Date;
}

function toPublicNote(n: Note, snippet?: string): PublicNote {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    courseId: n.courseId,
    aiSummary: n.aiSummary,
    ...(snippet !== undefined ? { snippet } : {}),
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

export interface NotesServiceDeps {
  prisma: PrismaClient;
  llm: LLMProvider;
  logger: Logger;
}

export interface NotesService {
  listNotes(
    userId: string,
    query: ListNotesQuery,
  ): Promise<{ items: PublicNote[]; nextCursor: string | null }>;
  createNote(userId: string, input: CreateNoteInput): Promise<PublicNote>;
  getNote(userId: string, noteId: string): Promise<PublicNote>;
  updateNote(userId: string, noteId: string, input: UpdateNoteInput): Promise<PublicNote>;
  deleteNote(userId: string, noteId: string): Promise<void>;
  summarizeNote(userId: string, noteId: string): Promise<{ summary: string }>;
}

export function createNotesService({ prisma, llm, logger }: NotesServiceDeps): NotesService {
  async function assertCourseOwned(userId: string, courseId: string) {
    const course = await prisma.course.findFirst({ where: { id: courseId, userId } });
    if (!course) throw new AppError('NOT_FOUND', 'Course not found');
    return course;
  }

  async function assertNoteOwned(userId: string, noteId: string) {
    const note = await prisma.note.findFirst({ where: { id: noteId, userId } });
    if (!note) throw new AppError('NOT_FOUND', 'Note not found');
    return note;
  }

  return {
    async listNotes(userId, query) {
      const courseFilter =
        query.courseId === 'none'
          ? { courseId: null }
          : query.courseId
            ? { courseId: query.courseId }
            : {};

      if (query.q && query.q.trim().length > 0) {
        const q = query.q.trim();
        try {
          type SearchRow = Note & { snippet: string | null };
          const rows = await prisma.$queryRaw<SearchRow[]>`
            SELECT
              id, user_id AS "userId", course_id AS "courseId", title, body,
              ai_summary AS "aiSummary", created_at AS "createdAt", updated_at AS "updatedAt",
              ts_headline('english', body, websearch_to_tsquery('english', ${q}), 'MaxWords=24, MinWords=8') AS snippet
            FROM notes
            WHERE user_id = ${userId}::uuid
              AND (${query.courseId ?? null}::text IS NULL
                OR (${query.courseId ?? null}::text = 'none' AND course_id IS NULL)
                OR (course_id = NULLIF(${query.courseId ?? null}::text, 'none')::uuid))
              AND (search_vector @@ websearch_to_tsquery('english', ${q})
                OR title ILIKE ${'%' + q + '%'})
            ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', ${q})) DESC, updated_at DESC
            LIMIT ${query.limit}
          `;
          return {
            items: rows.map((r) => toPublicNote(r, r.snippet ?? undefined)),
            nextCursor: null,
          };
        } catch (err) {
          logger.debug({ err }, 'FTS query fell back to ILIKE filter');
          const rows = await prisma.note.findMany({
            where: {
              userId,
              ...courseFilter,
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                { body: { contains: q, mode: 'insensitive' } },
              ],
            },
            orderBy: { updatedAt: 'desc' },
            take: query.limit,
          });
          return { items: rows.map((r) => toPublicNote(r)), nextCursor: null };
        }
      }

      const rows = await prisma.note.findMany({
        where: { userId, ...courseFilter },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });

      const hasMore = rows.length > query.limit;
      const sliced = hasMore ? rows.slice(0, query.limit) : rows;
      return {
        items: sliced.map((n) => toPublicNote(n)),
        nextCursor: hasMore ? (sliced.at(-1)?.id ?? null) : null,
      };
    },

    async createNote(userId, input) {
      if (input.courseId) {
        await assertCourseOwned(userId, input.courseId);
      }
      const created = await prisma.note.create({
        data: {
          userId,
          title: input.title,
          body: input.body,
          courseId: input.courseId ?? null,
        },
      });
      return toPublicNote(created);
    },

    async getNote(userId, noteId) {
      const note = await assertNoteOwned(userId, noteId);
      return toPublicNote(note);
    },

    async updateNote(userId, noteId, input) {
      await assertNoteOwned(userId, noteId);
      if (input.courseId) {
        await assertCourseOwned(userId, input.courseId);
      }
      const updated = await prisma.note.update({
        where: { id: noteId },
        data: input,
      });
      return toPublicNote(updated);
    },

    async deleteNote(userId, noteId) {
      await assertNoteOwned(userId, noteId);
      await prisma.note.delete({ where: { id: noteId } });
    },

    async summarizeNote(userId, noteId) {
      if (!llm.isConfigured()) {
        throw new AppError('AI_UNAVAILABLE', 'AI summarizer is not available right now');
      }
      const note = await assertNoteOwned(userId, noteId);
      if (note.body.trim().length < 50) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Write at least 50 characters in your note before summarizing',
        );
      }

      const { text } = await llm.generateText(
        `Summarize these student study notes into clear, concise bullet points highlighting key concepts and definitions.\n\nTitle: ${note.title}\n\nNotes:\n${note.body}`,
        {
          systemPrompt:
            'You are a concise academic study assistant. Return clean Markdown bullet points.',
          temperature: 0.3,
          maxOutputTokens: 600,
        },
      );

      const summary = text.trim();
      await prisma.note.update({
        where: { id: note.id },
        data: { aiSummary: summary },
      });

      return { summary };
    },
  };
}
