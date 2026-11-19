/**
 * Sanitizes a filename for safe inclusion in a quoted Content-Disposition header
 * by stripping control characters, quotes, and path separators.
 */
export function safeContentDispositionFilename(
  rawName: string | null | undefined,
  fallback = 'download',
): string {
  const cleaned = (rawName ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"\\/]/g, '')
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}
