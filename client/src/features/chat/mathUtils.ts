/**
 * Normalizes LaTeX math delimiters outside of fenced/inline code blocks and
 * buffers incomplete trailing math expressions during SSE streaming so half-typed
 * LaTeX never flashes raw delimiters or KaTeX errors.
 */

const CODE_SEGMENT_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`)/g;

function normalizeTextSegment(segment: string): string {
  // Convert display \[ ... \] -> $$\n...\n$$
  let out = segment.replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner: string) => {
    const trimmed = inner.trim();
    return trimmed ? `\n$$\n${trimmed}\n$$\n` : '';
  });

  // Convert inline \( ... \) -> $...$ (trimming inner spaces so remark-math parses it reliably)
  out = out.replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner: string) => {
    const trimmed = inner.trim();
    return trimmed ? `$${trimmed}$` : '';
  });

  // Ensure $$...$$ renders as display math on its own block even if emitted inline
  out = out.replace(/\$\$([^$\n]+?)\$\$/g, (_m, inner: string) => {
    const trimmed = inner.trim();
    return trimmed ? `\n\n$$\n${trimmed}\n$$\n\n` : '';
  });

  return out;
}

export function normalizeMathDelimiters(markdown: string): string {
  if (!markdown) return '';
  const parts = markdown.split(CODE_SEGMENT_RE);
  return parts.map((part, idx) => (idx % 2 === 1 ? part : normalizeTextSegment(part))).join('');
}

/**
 * During streaming, holds back an unclosed trailing math block (\[, \(, $$, or $)
 * outside of code blocks until its closing delimiter arrives.
 */
export function bufferStreamingMath(markdown: string, isStreaming: boolean): string {
  const normalized = normalizeMathDelimiters(markdown);
  if (!isStreaming || !normalized) return normalized;

  const parts = normalized.split(CODE_SEGMENT_RE);
  const lastIdx = parts.length - 1;
  // If we're currently inside an unclosed fenced code block, return as-is
  if (lastIdx % 2 === 1) return normalized;

  const tail = parts[lastIdx] ?? '';

  // Hold back unclosed raw \[ or \( that haven't closed yet before normalization
  const lastOpenBracket = tail.lastIndexOf('\\[');
  if (lastOpenBracket !== -1 && tail.indexOf('\\]', lastOpenBracket + 2) === -1) {
    parts[lastIdx] = tail.slice(0, lastOpenBracket) + '…';
    return parts.join('');
  }
  const lastOpenParen = tail.lastIndexOf('\\(');
  if (lastOpenParen !== -1 && tail.indexOf('\\)', lastOpenParen + 2) === -1) {
    parts[lastIdx] = tail.slice(0, lastOpenParen) + '…';
    return parts.join('');
  }

  // Count unescaped $$ across all non-code parts
  let displayOpenIdx = -1;
  let displayCount = 0;
  for (let i = 0; i < tail.length - 1; i += 1) {
    if (tail[i] === '\\') {
      i += 1;
      continue;
    }
    if (tail[i] === '$' && tail[i + 1] === '$') {
      displayCount += 1;
      displayOpenIdx = i;
      i += 1;
    }
  }
  if (displayCount % 2 === 1 && displayOpenIdx !== -1) {
    parts[lastIdx] = tail.slice(0, displayOpenIdx) + '…';
    return parts.join('');
  }

  // Check for an unclosed single $ on the last line (ignore currency like $20)
  const lastNewline = tail.lastIndexOf('\n');
  const lastLine = tail.slice(lastNewline + 1);
  let singleCount = 0;
  let lastSinglePos = -1;
  for (let i = 0; i < lastLine.length; i += 1) {
    if (lastLine[i] === '\\') {
      i += 1;
      continue;
    }
    if (lastLine[i] === '$') {
      if (lastLine[i + 1] === '$') {
        i += 1;
        continue;
      }
      // Likely currency if followed by digit and no LaTeX operators on the rest of line
      const rest = lastLine.slice(i + 1);
      if (/^\d/.test(rest) && !/[\\^_{}=+\-*/]/.test(rest)) {
        continue;
      }
      singleCount += 1;
      lastSinglePos = i;
    }
  }
  if (singleCount % 2 === 1 && lastSinglePos !== -1) {
    const cutAt = lastNewline + 1 + lastSinglePos;
    parts[lastIdx] = tail.slice(0, cutAt) + '…';
    return parts.join('');
  }

  return normalized;
}
