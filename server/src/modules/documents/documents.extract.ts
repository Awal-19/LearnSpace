import AdmZip from 'adm-zip';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import type { Logger } from 'pino';
import { createWorker } from 'tesseract.js';
import { assertSafePdfPages, assertSafeZipBounds, sharpSafe } from '../../lib/fileSafety';
import type { LLMProvider } from '../../lib/llm/provider';
import type { DetectedFile } from '../ai/attachments.service';
import type { DocumentPage } from './documents.schemas';

export const MAX_DOCUMENT_CHARS = 120_000;
const SECTION_TARGET_CHARS = 2_500;
const MAX_PDF_OCR_PAGES = 10;

export interface ExtractionResult {
  pages: DocumentPage[];
  extractedText: string;
  pageCount: number;
  truncated: boolean;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractXmlTextNodes(xml: string): string {
  const texts = Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g))
    .map((m) => decodeXmlEntities(m[1] ?? '').trim())
    .filter(Boolean);
  return texts.join(' ');
}

function splitIntoSections(raw: string, labelPrefix: string): DocumentPage[] {
  const cleaned = raw.replace(/\r\n/g, '\n').trim();
  if (!cleaned) {
    return [{ index: 1, label: `${labelPrefix} 1`, text: '', hasImages: false }];
  }

  const paragraphs = cleaned.split(/\n{2,}/);
  const pages: DocumentPage[] = [];
  let buffer = '';

  for (const para of paragraphs) {
    if (buffer && buffer.length + para.length + 2 > SECTION_TARGET_CHARS) {
      pages.push({
        index: pages.length + 1,
        label: `${labelPrefix} ${pages.length + 1}`,
        text: buffer.trim(),
        hasImages: false,
      });
      buffer = para;
    } else {
      buffer = buffer ? `${buffer}\n\n${para}` : para;
    }
  }
  if (buffer.trim()) {
    pages.push({
      index: pages.length + 1,
      label: `${labelPrefix} ${pages.length + 1}`,
      text: buffer.trim(),
      hasImages: false,
    });
  }

  return pages;
}

function extractPptxPages(buffer: Buffer): DocumentPage[] {
  const zip = new AdmZip(buffer);
  assertSafeZipBounds(zip);
  const entries = zip.getEntries();
  const slideEntries = entries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));

  const pages: DocumentPage[] = [];
  for (let i = 0; i < slideEntries.length; i++) {
    const entry = slideEntries[i]!;
    const match = entry.entryName.match(/slide(\d+)\.xml$/i);
    const slideNum = match ? Number(match[1]) : i + 1;
    const xml = entry.getData().toString('utf8');
    const slideText = extractXmlTextNodes(xml);
    const hasImages = /<a:blip\b|<p:pic\b/i.test(xml);

    const notesEntry = zip.getEntry(`ppt/notesSlides/notesSlide${slideNum}.xml`);
    const notesText = notesEntry ? extractXmlTextNodes(notesEntry.getData().toString('utf8')) : '';
    const combined = notesText ? `${slideText}\n[Speaker notes]: ${notesText}` : slideText;

    pages.push({
      index: slideNum,
      label: `Slide ${slideNum}`,
      text: combined.trim(),
      hasImages,
    });
  }

  if (pages.length === 0) {
    return [{ index: 1, label: 'Slide 1', text: '', hasImages: false }];
  }
  return pages;
}

async function runPdfOcrPages(
  buffer: Buffer,
  logger: Logger,
): Promise<{ pages: DocumentPage[]; truncated: boolean }> {
  const parser = new PDFParse({ data: buffer });
  try {
    const screenshot = await parser.getScreenshot({ first: MAX_PDF_OCR_PAGES, scale: 1.5 });
    const worker = await createWorker('eng');
    try {
      const pages: DocumentPage[] = [];
      for (let i = 0; i < screenshot.pages.length; i++) {
        const page = screenshot.pages[i]!;
        let text = '';
        if (page.data) {
          const result = await worker.recognize(Buffer.from(page.data));
          text = result.data.text.trim();
        }
        pages.push({
          index: i + 1,
          label: `Page ${i + 1}`,
          text,
          hasImages: true,
        });
      }
      return {
        pages,
        truncated: screenshot.total > MAX_PDF_OCR_PAGES,
      };
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    logger.warn({ err }, 'OCR on scanned PDF failed');
    return { pages: [], truncated: false };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

async function extractPdfPages(
  buffer: Buffer,
  logger: Logger,
): Promise<{ pages: DocumentPage[]; ocrTruncated: boolean }> {
  const parser = new PDFParse({ data: buffer });
  let pages: DocumentPage[] = [];
  let totalRawText = '';

  try {
    const parsed = await parser.getText();
    assertSafePdfPages(parsed.total ?? 1);
    totalRawText = (parsed.text ?? '').replace(/\r\n/g, '\n').trim();
    const parsedPages = (parsed as unknown as { pages?: Array<{ num?: number; text?: string }> })
      .pages;

    if (Array.isArray(parsedPages) && parsedPages.length > 0) {
      pages = parsedPages.map((p, idx) => ({
        index: p.num ?? idx + 1,
        label: `Page ${p.num ?? idx + 1}`,
        text: (p.text ?? '').replace(/\r\n/g, '\n').trim(),
        hasImages: false,
      }));
    } else if (totalRawText) {
      const parts = totalRawText.split('\f').map((t) => t.trim());
      pages = parts.map((text, idx) => ({
        index: idx + 1,
        label: `Page ${idx + 1}`,
        text,
        hasImages: false,
      }));
    }
  } finally {
    await parser.destroy().catch(() => undefined);
  }

  const avgChars = pages.length > 0 ? totalRawText.length / pages.length : 0;
  if (totalRawText.length < 60 || avgChars < 35) {
    const ocr = await runPdfOcrPages(buffer, logger);
    const ocrChars = ocr.pages.reduce((acc, p) => acc + p.text.length, 0);
    if (ocrChars > totalRawText.length) {
      return { pages: ocr.pages, ocrTruncated: ocr.truncated };
    }
  }

  if (pages.length === 0) {
    pages = [{ index: 1, label: 'Page 1', text: totalRawText, hasImages: false }];
  }
  return { pages, ocrTruncated: false };
}

async function transcribeImageWithVision(
  buffer: Buffer,
  mimeType: string,
  llm: LLMProvider,
  logger: Logger,
): Promise<string> {
  try {
    const jpeg = await sharpSafe(buffer)
      .rotate()
      .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`;

    let output = '';
    const stream = llm.stream(
      [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Transcribe everything visible in this ${mimeType} image accurately.`,
            },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      {
        systemPrompt:
          'You are an accurate academic OCR and diagram transcriber. Transcribe all visible text, question numbers, marks, formulas, tables, and diagrams verbatim. If any part is blurry or cut off, mark it [unreadable]. Never guess or invent text.',
        maxOutputTokens: 2048,
        temperature: 0.1,
      },
    );

    for await (const chunk of stream) {
      if (chunk.type === 'delta') output += chunk.text;
    }
    return output.trim();
  } catch (err) {
    logger.warn({ err }, 'Vision transcription fallback failed');
    return '';
  }
}

async function extractImagePage(
  buffer: Buffer,
  mimeType: string,
  logger: Logger,
  llm?: LLMProvider,
): Promise<DocumentPage[]> {
  let ocrText = '';
  try {
    const pngBuffer = await sharpSafe(buffer)
      .rotate()
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    const worker = await createWorker('eng');
    try {
      const result = await worker.recognize(pngBuffer);
      ocrText = result.data.text.trim();
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    logger.warn({ err }, 'Image OCR failed');
  }

  let finalText = ocrText;
  if (llm && ocrText.length < 120) {
    const visionText = await transcribeImageWithVision(buffer, mimeType, llm, logger);
    if (visionText.length > finalText.length) {
      finalText = visionText;
    }
  }

  return [
    {
      index: 1,
      label: 'Page 1 (Image)',
      text: finalText,
      hasImages: true,
    },
  ];
}

export async function extractDocumentPages(
  buffer: Buffer,
  detected: DetectedFile,
  logger: Logger,
  llm?: LLMProvider,
): Promise<ExtractionResult> {
  let pages: DocumentPage[] = [];
  let truncated = false;

  if (detected.kind === 'image') {
    pages = await extractImagePage(buffer, detected.mimeType, logger, llm);
  } else if (detected.mimeType === 'application/pdf') {
    const pdf = await extractPdfPages(buffer, logger);
    pages = pdf.pages;
    truncated = pdf.ocrTruncated;
  } else if (detected.extension === 'pptx') {
    pages = extractPptxPages(buffer);
  } else if (detected.extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    pages = splitIntoSections(result.value ?? '', 'Section');
  } else {
    pages = splitIntoSections(buffer.toString('utf8'), 'Section');
  }

  let totalChars = 0;
  const boundedPages: DocumentPage[] = [];
  for (const page of pages) {
    if (totalChars >= MAX_DOCUMENT_CHARS) {
      truncated = true;
      break;
    }
    const remaining = MAX_DOCUMENT_CHARS - totalChars;
    if (page.text.length > remaining) {
      boundedPages.push({
        ...page,
        text: page.text.slice(0, remaining),
      });
      totalChars += remaining;
      truncated = true;
      break;
    }
    boundedPages.push(page);
    totalChars += page.text.length;
  }

  const extractedText = boundedPages
    .map((p) => `--- ${p.label} ---\n${p.text}`)
    .join('\n\n')
    .trim();

  return {
    pages: boundedPages,
    extractedText,
    pageCount: boundedPages.length,
    truncated,
  };
}
