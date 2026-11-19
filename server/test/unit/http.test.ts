import { describe, expect, it } from 'vitest';
import { safeContentDispositionFilename } from '../../src/lib/http';

describe('safeContentDispositionFilename', () => {
  it('strips CRLF, quotes, backslashes, and control characters', () => {
    expect(safeContentDispositionFilename('report"\r\nX-Injected: 1\\foo/bar.pdf')).toBe(
      'reportX-Injected: 1foobar.pdf',
    );
  });

  it('falls back when filename becomes empty', () => {
    expect(safeContentDispositionFilename('""\r\n\\/', 'attachment')).toBe('attachment');
    expect(safeContentDispositionFilename(undefined, 'export')).toBe('export');
  });
});
