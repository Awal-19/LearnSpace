import path from 'node:path';
import type { AttachmentKind, MessageAttachment, PrismaClient } from '@prisma/client';
import AdmZip from 'adm-zip';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { Logger } from 'pino';
import { createWorker } from 'tesseract.js';
import { AppError } from '../../lib/errors';
import { assertSafePdfPages, assertSafeZipBounds, sharpSafe } from '../../lib/fileSafety';
import type { StorageService } from '../../lib/storage';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_DOC_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_EXTRACTED_CHARS = 24_000;
export const DAILY_UPLOAD_QUOTA = 50;

export interface MalwareScanner {
  scan(buffer: Buffer, filename: string): Promise<{ clean: boolean; reason?: string }>;
}

/**
 * Default malware scanner hook.
 * TODO: Wire a ClamAV daemon (clamscan / clamd TCP) in production environments.
 */
export const noopMalwareScanner: MalwareScanner = {
  async scan() {
    return { clean: true };
  },
};

export interface DetectedFile {
  mimeType: string;
  kind: AttachmentKind;
  extension: string;
}

export interface PublicAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  kind: AttachmentKind;
  sizeBytes: number;
  truncated: boolean;
  url: string;
  createdAt: Date;
}

export function toPublicAttachment(a: MessageAttachment): PublicAttachment {
  return {
    id: a.id,
    originalName: a.originalName,
    mimeType: a.mimeType,
    kind: a.kind,
    sizeBytes: a.sizeBytes,
    truncated: a.truncated,
    url: `/api/v1/ai/attachments/${a.id}/content`,
    createdAt: a.createdAt,
  };
}

/**
 * Verifies real file type from magic bytes / container structure rather than trusting extensions.
 */
export function detectAttachmentType(
  buffer: Buffer,
  declaredMime: string,
  filename: string,
): DetectedFile | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', kind: 'image', extension: 'jpg' };
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mimeType: 'image/png', kind: 'image', extension: 'png' };
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mimeType: 'image/webp', kind: 'image', extension: 'webp' };
  }

  // ISO BMFF / HEIC: bytes 4..7 == 'ftyp', major brand heic/heix/mif1/msf1/hevc
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
    if (['heic', 'heix', 'mif1', 'msf1', 'hevc'].includes(brand)) {
      return { mimeType: 'image/heic', kind: 'image', extension: 'heic' };
    }
  }

  if (buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-') {
    return { mimeType: 'application/pdf', kind: 'document', extension: 'pdf' };
  }

  // OOXML (DOCX / PPTX) are ZIP containers starting with PK\x03\x04
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    try {
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries().map((e) => e.entryName);
      if (entries.some((e) => e.startsWith('word/'))) {
        return {
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          kind: 'document',
          extension: 'docx',
        };
      }
      if (entries.some((e) => e.startsWith('ppt/'))) {
        return {
          mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          kind: 'document',
          extension: 'pptx',
        };
      }
    } catch {
      return null;
    }
  }

  // Plain text / CSV: no NUL bytes, valid UTF-8, and declared text/plain, text/csv, or .txt/.csv extension
  const ext = path.extname(filename).toLowerCase();
  const isTextCandidate =
    declaredMime === 'text/plain' ||
    declaredMime === 'text/csv' ||
    declaredMime === 'application/csv' ||
    ext === '.txt' ||
    ext === '.csv';
  if (isTextCandidate && !buffer.includes(0)) {
    const isCsv = declaredMime.includes('csv') || ext === '.csv';
    return {
      mimeType: isCsv ? 'text/csv' : 'text/plain',
      kind: 'document',
      extension: isCsv ? 'csv' : 'txt',
    };
  }

  return null;
}

export function sanitizeFilename(name: string): string {
  const base = path
    .basename(name)
    .replace(/[^\w.\- ()]/g, '_')
    .trim();
  return (base || 'attachment').slice(0, 255);
}

function extractPptxText(buffer: Buffer): string {
  const zip = new AdmZip(buffer);
  assertSafeZipBounds(zip);
  const slideEntries = zip
    .getEntries()
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));

  const slides: string[] = [];
  for (const entry of slideEntries) {
    const xml = entry.getData().toString('utf8');
    const texts = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)).map((m) =>
      (m[1] ?? '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
    );
    if (texts.length > 0) {
      slides.push(`[${entry.entryName}]\n${texts.join(' ')}`);
    }
  }
  return slides.join('\n\n');
}

async function runPdfOcr(buffer: Buffer, logger: Logger): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const screenshot = await parser.getScreenshot({ first: 3, scale: 1.5 });
    const worker = await createWorker('eng');
    try {
      const pages: string[] = [];
      for (const page of screenshot.pages) {
        if (!page.data) continue;
        const result = await worker.recognize(Buffer.from(page.data));
        if (result.data.text.trim()) {
          pages.push(result.data.text.trim());
        }
      }
      return pages.join('\n\n');
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    logger.warn({ err }, 'OCR fallback on scanned PDF failed');
    return '';
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractDocumentText(
  buffer: Buffer,
  detected: DetectedFile,
  logger: Logger,
): Promise<{ text: string; truncated: boolean }> {
  let raw = '';

  if (detected.mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      assertSafePdfPages(parsed.total ?? 1);
      raw = parsed.text ?? '';
    } finally {
      await parser.destroy().catch(() => undefined);
    }
    if (raw.trim().length < 40) {
      const ocrText = await runPdfOcr(buffer, logger);
      if (ocrText.trim().length > raw.trim().length) {
        raw = ocrText;
      }
    }
  } else if (detected.extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    raw = result.value ?? '';
  } else if (detected.extension === 'pptx') {
    raw = extractPptxText(buffer);
  } else {
    raw = buffer.toString('utf8');
  }

  const cleaned = raw.replace(/\r\n/g, '\n').trim();
  if (cleaned.length > MAX_EXTRACTED_CHARS) {
    return { text: cleaned.slice(0, MAX_EXTRACTED_CHARS), truncated: true };
  }
  return { text: cleaned, truncated: false };
}

export interface AttachmentsServiceDeps {
  prisma: PrismaClient;
  storage: StorageService;
  logger: Logger;
  scanner?: MalwareScanner;
}

export interface AttachmentsService {
  upload(params: {
    userId: string;
    conversationId: string;
    filename: string;
    declaredMime: string;
    buffer: Buffer;
  }): Promise<PublicAttachment>;
  getOwnedAttachment(userId: string, attachmentId: string): Promise<MessageAttachment>;
  getContent(
    userId: string,
    attachmentId: string,
  ): Promise<{ attachment: MessageAttachment; signedUrl: string | null; buffer?: Buffer }>;
  deleteAttachment(userId: string, attachmentId: string): Promise<void>;
  deleteConversationAttachments(conversationId: string): Promise<void>;
}

export function createAttachmentsService({
  prisma,
  storage,
  logger,
  scanner = noopMalwareScanner,
}: AttachmentsServiceDeps): AttachmentsService {
  return {
    async upload({ userId, conversationId, filename, declaredMime, buffer }) {
      const conv = await prisma.conversation.findFirst({
        where: { id: conversationId, userId },
        select: { id: true },
      });
      if (!conv) throw new AppError('NOT_FOUND', 'Conversation not found');

      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const todayCount = await prisma.messageAttachment.count({
        where: { userId, createdAt: { gte: startOfDay } },
      });
      if (todayCount >= DAILY_UPLOAD_QUOTA) {
        throw new AppError('RATE_LIMITED', 'Daily file upload limit reached. Try again tomorrow.');
      }

      const detected = detectAttachmentType(buffer, declaredMime, filename);
      if (!detected) {
        throw new AppError(
          'UNSUPPORTED_MEDIA_TYPE',
          'Supported files: JPG, PNG, WEBP, HEIC, PDF, DOCX, PPTX, TXT, CSV',
        );
      }

      const maxBytes = detected.kind === 'image' ? MAX_IMAGE_BYTES : MAX_DOC_BYTES;
      if (buffer.length > maxBytes) {
        throw new AppError(
          'PAYLOAD_TOO_LARGE',
          detected.kind === 'image'
            ? 'Images must be 10 MB or smaller'
            : 'Documents must be 20 MB or smaller',
        );
      }

      const scanResult = await scanner.scan(buffer, filename);
      if (!scanResult.clean) {
        throw new AppError(
          'VALIDATION_ERROR',
          scanResult.reason ?? 'File rejected by security scan',
        );
      }

      let finalBuffer = buffer;
      let finalMime = detected.mimeType;
      let finalExt = detected.extension;
      let extractedText: string | null = null;
      let truncated = false;

      if (detected.kind === 'image') {
        // Auto-orient via EXIF and strip all EXIF/GPS metadata by converting to clean WebP/JPEG.
        try {
          finalBuffer = await sharpSafe(buffer)
            .rotate()
            .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
          finalMime = 'image/jpeg';
          finalExt = 'jpg';
        } catch (err) {
          logger.warn({ err, filename }, 'Sharp image normalization failed');
          throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Could not process this image file');
        }
      } else {
        try {
          const extracted = await extractDocumentText(buffer, detected, logger);
          extractedText = extracted.text;
          truncated = extracted.truncated;
        } catch (err) {
          logger.warn({ err, filename }, 'Document text extraction failed');
          throw new AppError('VALIDATION_ERROR', 'Could not extract text from this document');
        }
      }

      const stored = await storage.uploadAttachment(finalBuffer, userId, detected.kind, finalExt);
      const record = await prisma.messageAttachment.create({
        data: {
          userId,
          conversationId,
          originalName: sanitizeFilename(filename),
          mimeType: finalMime,
          kind: detected.kind,
          sizeBytes: finalBuffer.length,
          storageKey: stored.storageKey,
          storageUrl: stored.storageUrl,
          extractedText,
          truncated,
        },
      });

      return toPublicAttachment(record);
    },

    async getOwnedAttachment(userId, attachmentId) {
      const row = await prisma.messageAttachment.findFirst({
        where: { id: attachmentId, userId },
      });
      if (!row) throw new AppError('NOT_FOUND', 'Attachment not found');
      return row;
    },

    async getContent(userId, attachmentId) {
      const attachment = await this.getOwnedAttachment(userId, attachmentId);
      const signedUrl = storage.getSignedAttachmentUrl(attachment.storageKey, attachment.kind);
      if (signedUrl) {
        return { attachment, signedUrl };
      }
      const buffer = await storage.readAttachmentBytes(
        attachment.storageKey,
        attachment.storageUrl,
        attachment.kind,
      );
      return { attachment, signedUrl: null, buffer };
    },

    async deleteAttachment(userId, attachmentId) {
      const attachment = await this.getOwnedAttachment(userId, attachmentId);
      await prisma.messageAttachment.delete({ where: { id: attachmentId } });
      await storage.deleteAttachment(attachment.storageKey, attachment.kind);
    },

    async deleteConversationAttachments(conversationId) {
      const rows = await prisma.messageAttachment.findMany({
        where: { conversationId },
        select: { storageKey: true, kind: true },
      });
      await Promise.all(rows.map((r) => storage.deleteAttachment(r.storageKey, r.kind)));
    },
  };
}
