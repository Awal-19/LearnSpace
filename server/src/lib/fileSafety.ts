import { randomBytes } from 'node:crypto';
import type AdmZip from 'adm-zip';
import sharp from 'sharp';
import { AppError } from './errors';

export const MAX_ZIP_ENTRIES = 1000;
export const MAX_ZIP_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_PDF_PAGES = 150;
export const SHARP_MAX_INPUT_PIXELS = 25_000_000; // 5000 x 5000

/**
 * Guards against ZIP bombs (excessive entry counts or uncompressed inflation).
 */
export function assertSafeZipBounds(
  zip: AdmZip,
  maxEntries = MAX_ZIP_ENTRIES,
  maxUncompressedBytes = MAX_ZIP_UNCOMPRESSED_BYTES,
): void {
  const entries = zip.getEntries();
  if (entries.length > maxEntries) {
    throw new AppError('VALIDATION_ERROR', 'Archive contains too many entries');
  }
  let totalUncompressed = 0;
  for (const entry of entries) {
    const size = Math.max(0, Number(entry.header?.size ?? 0));
    totalUncompressed += size;
    if (size > maxUncompressedBytes || totalUncompressed > maxUncompressedBytes) {
      throw new AppError('PAYLOAD_TOO_LARGE', 'Archive expands beyond the allowed size limit');
    }
  }
}

/**
 * Caps PDF page counts to prevent CPU/memory exhaustion on oversized documents.
 */
export function assertSafePdfPages(pageCount: number, maxPages = MAX_PDF_PAGES): void {
  if (Number.isFinite(pageCount) && pageCount > maxPages) {
    throw new AppError('VALIDATION_ERROR', `PDF exceeds the maximum ${maxPages}-page limit`);
  }
}

/**
 * Opens an image buffer with sharp while enforcing a strict pixel-dimension cap
 * to prevent decompression bombs.
 */
export function sharpSafe(buffer: Buffer) {
  return sharp(buffer, { limitInputPixels: SHARP_MAX_INPUT_PIXELS });
}

/**
 * Wraps untrusted document/RAG text in an XML-like boundary tag with a per-call
 * random nonce and neutralizes embedded closing tags to resist prompt injection.
 */
export function wrapUntrustedContext(
  tag: 'lecture_notes' | 'attached_document',
  body: string,
  attrs: Record<string, string> = {},
): string {
  const nonce = randomBytes(6).toString('hex');
  const escapedBody = body.replace(new RegExp(`</?${tag}\\b`, 'gi'), (m) => `<\\/${m.slice(1)}`);
  const attrParts = Object.entries(attrs).map(([k, v]) => `${k}="${v.replace(/["\r\n<>]/g, '_')}"`);
  attrParts.push(`boundary="${nonce}"`);
  return `<${tag} ${attrParts.join(' ')}>\n${escapedBody}\n</${tag}>`;
}

export interface MalwareScanResult {
  clean: boolean;
  reason?: string;
}

/**
 * Optional HTTP malware scanner hook (e.g., ClamAV REST sidecar).
 * Fails closed if configured and unreachable/infected; passes when unconfigured.
 */
export async function scanWithHttpScanner(
  scannerUrl: string | undefined,
  buffer: Buffer,
  filename: string,
): Promise<MalwareScanResult> {
  if (!scannerUrl) return { clean: true };
  try {
    const res = await fetch(scannerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': filename.replace(/[\r\n"]/g, '_').slice(0, 180),
      },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      return { clean: false, reason: 'Security scanner rejected or failed to scan this file.' };
    }
    const data = (await res.json()) as { clean?: boolean; reason?: string };
    return { clean: data.clean === true, reason: data.reason };
  } catch {
    return { clean: false, reason: 'Security scanner is temporarily unavailable.' };
  }
}
