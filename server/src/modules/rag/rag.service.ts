import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import { PDFParse } from 'pdf-parse';
import { AppError } from '../../lib/errors';
import { assertSafePdfPages, wrapUntrustedContext } from '../../lib/fileSafety';

export interface PublicStudyDocument {
  id: string;
  courseId: string | null;
  filename: string;
  sizeBytes: number;
  pageCount: number;
  chunkCount: number;
  createdAt: Date;
}

export interface RetrievedChunk {
  documentId: string;
  filename: string;
  chunkIndex: number;
  content: string;
  score: number;
}

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'had',
  'her',
  'was',
  'one',
  'our',
  'out',
  'day',
  'get',
  'has',
  'him',
  'his',
  'how',
  'its',
  'may',
  'new',
  'now',
  'old',
  'see',
  'two',
  'who',
  'boy',
  'did',
  'let',
  'put',
  'say',
  'she',
  'too',
  'use',
  'what',
  'when',
  'where',
  'which',
  'while',
  'with',
  'this',
  'that',
  'from',
  'they',
  'been',
  'have',
  'were',
  'will',
  'would',
  'there',
  'their',
  'about',
  'into',
  'explain',
  'please',
  'help',
  'understand',
]);

/** Checks PDF magic bytes (%PDF-) rather than trusting Content-Type or extension. */
export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
}

/** Splits extracted document text into overlapping chunks for retrieval. */
export function chunkText(rawText: string, maxChars = 900, overlap = 150): string[] {
  const normalized = rawText
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(normalized.length, start + maxChars);
    if (end < normalized.length) {
      const lastPeriod = normalized.lastIndexOf('. ', end);
      const lastNewline = normalized.lastIndexOf('\n', end);
      const breakAt = Math.max(lastPeriod, lastNewline);
      if (breakAt > start + maxChars * 0.5) {
        end = breakAt + 1;
      }
    }

    const slice = normalized.slice(start, end).trim();
    if (slice) chunks.push(slice);
    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

export function formatRagContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '';
  const body = chunks
    .map((c) => `[Source: ${c.filename} | Section ${c.chunkIndex + 1}]\n${c.content}`)
    .join('\n\n---\n\n');

  return wrapUntrustedContext('lecture_notes', body);
}

export interface RagServiceDeps {
  prisma: PrismaClient;
  logger: Logger;
}

export interface RagService {
  uploadPdf(
    userId: string,
    filename: string,
    buffer: Buffer,
    courseId?: string | null,
  ): Promise<PublicStudyDocument>;
  listDocuments(userId: string, courseId?: string): Promise<PublicStudyDocument[]>;
  deleteDocument(userId: string, documentId: string): Promise<void>;
  retrieveRelevantChunks(
    userId: string,
    query: string,
    limit?: number,
    courseId?: string | null,
  ): Promise<RetrievedChunk[]>;
}

export function createRagService({ prisma, logger }: RagServiceDeps): RagService {
  return {
    async uploadPdf(userId, filename, buffer, courseId = null) {
      if (courseId) {
        const course = await prisma.course.findFirst({ where: { id: courseId, userId } });
        if (!course) throw new AppError('NOT_FOUND', 'Course not found');
      }
      if (!isPdfBuffer(buffer)) {
        throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Uploaded file must be a valid PDF document');
      }

      let extractedText = '';
      let pageCount = 1;
      const parser = new PDFParse({ data: buffer });
      try {
        const parsed = await parser.getText();
        extractedText = parsed.text;
        pageCount = parsed.total || 1;
        assertSafePdfPages(pageCount);
      } catch (err) {
        if (err instanceof AppError) throw err;
        logger.warn({ err, filename }, 'PDF text extraction failed');
        throw new AppError('VALIDATION_ERROR', 'Could not read text from this PDF file');
      } finally {
        await parser.destroy().catch(() => undefined);
      }

      const chunks = chunkText(extractedText);
      if (chunks.length === 0) {
        throw new AppError(
          'VALIDATION_ERROR',
          'This PDF contains no extractable text (scanned images are not supported)',
        );
      }

      const safeName = filename.replace(/[^\w.\- ()]/g, '_').slice(0, 255) || 'lecture-notes.pdf';

      const doc = await prisma.studyDocument.create({
        data: {
          userId,
          courseId: courseId ?? null,
          filename: safeName,
          sizeBytes: buffer.length,
          pageCount,
          chunks: {
            create: chunks.map((content, chunkIndex) => ({
              userId,
              chunkIndex,
              content,
            })),
          },
        },
      });

      return {
        id: doc.id,
        courseId: (doc as { courseId?: string | null }).courseId ?? null,
        filename: doc.filename,
        sizeBytes: doc.sizeBytes,
        pageCount: doc.pageCount,
        chunkCount: chunks.length,
        createdAt: doc.createdAt,
      };
    },

    async listDocuments(userId, courseId) {
      const courseFilter = courseId === 'none' ? { courseId: null } : courseId ? { courseId } : {};
      const docs = await prisma.studyDocument.findMany({
        where: { userId, ...courseFilter },
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { chunks: true } } },
      });

      return docs.map((d) => ({
        id: d.id,
        courseId: (d as { courseId?: string | null }).courseId ?? null,
        filename: d.filename,
        sizeBytes: d.sizeBytes,
        pageCount: d.pageCount,
        chunkCount: d._count.chunks,
        createdAt: d.createdAt,
      }));
    },

    async deleteDocument(userId, documentId) {
      const doc = await prisma.studyDocument.findFirst({ where: { id: documentId, userId } });
      if (!doc) throw new AppError('NOT_FOUND', 'Document not found');
      await prisma.studyDocument.delete({ where: { id: documentId } });
    },

    async retrieveRelevantChunks(userId, query, limit = 4, courseId = null) {
      const queryTerms = Array.from(new Set(tokenize(query)));
      if (queryTerms.length === 0) return [];

      const rows = await prisma.documentChunk.findMany({
        where: { userId },
        include: { document: { select: { filename: true, courseId: true } } },
        take: 400,
      });

      if (rows.length === 0) return [];

      const scored: RetrievedChunk[] = [];
      for (const row of rows) {
        const lower = row.content.toLowerCase();
        let score = 0;
        for (const term of queryTerms) {
          if (lower.includes(term)) {
            score += 1;
          }
        }
        if (score > 0) {
          const docCourseId = (row.document as { courseId?: string | null }).courseId ?? null;
          if (courseId && docCourseId === courseId) {
            score += 0.5;
          }
          scored.push({
            documentId: row.documentId,
            filename: row.document.filename,
            chunkIndex: row.chunkIndex,
            content: row.content,
            score,
          });
        }
      }

      scored.sort((a, b) => b.score - a.score || a.chunkIndex - b.chunkIndex);
      return scored.slice(0, limit);
    },
  };
}
