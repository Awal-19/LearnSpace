export interface DictationLanguageOption {
  code: string;
  label: string;
  shortLabel: string;
  whisperCode: string;
}

export const DICTATION_LANGUAGES: readonly DictationLanguageOption[] = [
  { code: 'en-GH', label: 'English (Ghana / West Africa)', shortLabel: 'EN-GH', whisperCode: 'en' },
  { code: 'en-GB', label: 'English (UK)', shortLabel: 'EN-UK', whisperCode: 'en' },
  { code: 'en-US', label: 'English (US)', shortLabel: 'EN-US', whisperCode: 'en' },
  { code: 'fr-FR', label: 'French', shortLabel: 'FR', whisperCode: 'fr' },
  { code: 'es-ES', label: 'Spanish', shortLabel: 'ES', whisperCode: 'es' },
  { code: 'pt-PT', label: 'Portuguese', shortLabel: 'PT', whisperCode: 'pt' },
  { code: 'ar-SA', label: 'Arabic', shortLabel: 'AR', whisperCode: 'ar' },
] as const;

export const DEFAULT_DICTATION_LANGUAGE = 'en-GH';

export function getWhisperLanguageCode(bcp47: string): string {
  const match = DICTATION_LANGUAGES.find((l) => l.code === bcp47);
  if (match) return match.whisperCode;
  return bcp47.split('-')[0] || 'en';
}

const NUMBER_WORDS: Record<string, string> = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
  thirty: '30',
  forty: '40',
  fifty: '50',
  sixty: '60',
  seventy: '70',
  eighty: '80',
  ninety: '90',
};

/**
 * Replaces spoken punctuation keywords ("full stop", "comma", "new line", etc.)
 * with punctuation characters.
 */
export function applySpokenPunctuation(input: string): string {
  return input
    .replace(/[ \t]*\b(new line|next line)\b[ \t]*/gi, '\n')
    .replace(/[ \t]*\b(new paragraph)\b[ \t]*/gi, '\n\n')
    .replace(/\s*\b(full stop|period)\b/gi, '.')
    .replace(/\s*\bcomma\b/gi, ',')
    .replace(/\s*\bquestion mark\b/gi, '?')
    .replace(/\s*\bexclamation mark\b/gi, '!')
    .replace(/\s*\bcolon\b/gi, ':')
    .replace(/\s*\bsemicolon\b/gi, ';')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Converts spoken academic/maths dictation (e.g. "x squared plus two x equals eight")
 * into readable maths notation ("x^2 + 2x = 8") while leaving normal prose intact.
 */
export function applyMathsDictation(input: string): string {
  const hasMathsCue =
    /\b(squared|cubed|plus|minus|equals|equal to|divided by|multiplied by|times|square root|to the power of|greater than|less than|not equal|integral|pi|theta|alpha|beta|sigma)\b/i.test(
      input,
    );
  if (!hasMathsCue) return input;

  let out = input;

  // Convert number words only in maths context so prose like "one day" isn't altered unnecessarily.
  out = out.replace(
    new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\b`, 'gi'),
    (m) => NUMBER_WORDS[m.toLowerCase()] ?? m,
  );

  // Powers & roots
  out = out
    .replace(/\bsquare root of\s+([a-z0-9]+)/gi, 'sqrt($1)')
    .replace(/\bcube root of\s+([a-z0-9]+)/gi, 'cbrt($1)')
    .replace(/\b([a-z0-9]+)\s+squared\b/gi, '$1^2')
    .replace(/\b([a-z0-9]+)\s+cubed\b/gi, '$1^3')
    .replace(/\b([a-z0-9]+)\s+to the power of\s+([a-z0-9]+)\b/gi, '$1^$2');

  // Comparison & arithmetic operators
  out = out
    .replace(/\bgreater than or equal to\b/gi, '>=')
    .replace(/\bless than or equal to\b/gi, '<=')
    .replace(/\bnot equal to\b/gi, '!=')
    .replace(/\bgreater than\b/gi, '>')
    .replace(/\bless than\b/gi, '<')
    .replace(/\b(is equal to|equals)\b/gi, '=')
    .replace(/\bplus or minus\b/gi, '+/-')
    .replace(/\bplus\b/gi, '+')
    .replace(/\bminus\b/gi, '-')
    .replace(/\b(multiplied by|times)\b/gi, '*')
    .replace(/\bdivided by\b/gi, '/');

  // Implicit multiplication between coefficient and single variable (e.g. "2 x" -> "2x")
  out = out.replace(/\b(\d+)\s+([a-z])\b/gi, '$1$2');

  // Normalize spacing around operators
  out = out
    .replace(/\s*([=+\-*/<>]|>=|<=|!=)\s*/g, ' $1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return out;
}

/**
 * Deduplicates overlapping or repeated phrases common on Android Chrome Web Speech.
 */
export function mergeTranscriptSegment(existing: string, incoming: string): string {
  const cleanExisting = existing.trim();
  const cleanIncoming = incoming.trim();
  if (!cleanIncoming) return cleanExisting;
  if (!cleanExisting) return cleanIncoming;

  // Exact tail duplication (Android sometimes re-emits the last finalized segment)
  if (cleanExisting.toLowerCase().endsWith(cleanIncoming.toLowerCase())) {
    return cleanExisting;
  }

  const existingWords = cleanExisting.split(/\s+/);
  const incomingWords = cleanIncoming.split(/\s+/);
  const maxOverlap = Math.min(existingWords.length, incomingWords.length, 8);

  for (let overlap = maxOverlap; overlap >= 1; overlap -= 1) {
    const tail = existingWords.slice(-overlap).join(' ').toLowerCase();
    const head = incomingWords.slice(0, overlap).join(' ').toLowerCase();
    if (tail === head) {
      const rest = incomingWords.slice(overlap).join(' ');
      return rest ? `${cleanExisting} ${rest}` : cleanExisting;
    }
  }

  return `${cleanExisting} ${cleanIncoming}`;
}

/**
 * Inserts dictated text at the active cursor/selection without erasing existing input.
 */
export function insertAtCursor(
  currentValue: string,
  insertion: string,
  selectionStart?: number | null,
  selectionEnd?: number | null,
): { nextValue: string; nextCursor: number } {
  const clean = insertion.trim();
  if (!clean) {
    const pos = selectionStart ?? currentValue.length;
    return { nextValue: currentValue, nextCursor: pos };
  }

  const start =
    typeof selectionStart === 'number' &&
    selectionStart >= 0 &&
    selectionStart <= currentValue.length
      ? selectionStart
      : currentValue.length;
  const end =
    typeof selectionEnd === 'number' && selectionEnd >= start && selectionEnd <= currentValue.length
      ? selectionEnd
      : start;

  const before = currentValue.slice(0, start);
  const after = currentValue.slice(end);

  const needsLeadingSpace =
    before.length > 0 && !/[\s(\n]$/.test(before) && !/^[.,?!:;]/.test(clean);
  const needsTrailingSpace = after.length > 0 && !/^[\s.,?!:;\n)]/.test(after);

  const chunk = `${needsLeadingSpace ? ' ' : ''}${clean}${needsTrailingSpace ? ' ' : ''}`;
  const nextValue = `${before}${chunk}${after}`;
  const nextCursor = before.length + chunk.length;
  return { nextValue, nextCursor };
}
