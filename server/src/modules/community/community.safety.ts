import { extractDomain, isDomainDenied } from '../courses/recommendations.safety';

const DEFAULT_PROFANITY_PATTERNS = [
  /\b(fuck|shit|bitch|asshole|bastard|dickhead|slut|whore)\b/i,
  /\b(kill yourself|kys)\b/i,
];

export function normalizeSlugPart(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function buildCommunitySlug(
  courseName: string,
  university?: string | null,
): {
  slug: string;
  normalizedName: string;
  universityKey: string | null;
} {
  const normalizedName = normalizeSlugPart(courseName) || 'course';
  const universityKey = university?.trim() ? normalizeSlugPart(university) : null;
  const slug = universityKey ? `${normalizedName}::${universityKey}` : normalizedName;
  return {
    slug: slug.slice(0, 200),
    normalizedName: normalizedName.slice(0, 120),
    universityKey: universityKey ? universityKey.slice(0, 120) : null,
  };
}

/**
 * Strips ASCII control characters (except \n, \r, \t) and neutralizes raw HTML script/iframe tags
 * while preserving Markdown and LaTeX math ($...$, $$...$$).
 */
export function sanitizeCommunityText(raw: string, maxLen = 10_000): string {
  const cleaned = Array.from(raw, (ch) => {
    const code = ch.charCodeAt(0);
    if (code <= 0x1f && code !== 0x0a && code !== 0x0d && code !== 0x09) return ' ';
    if (code === 0x7f) return ' ';
    return ch;
  }).join('');

  return cleaned
    .replace(/<\s*\/?\s*(script|iframe|object|embed|style|form)[^>]*>/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:')
    .replace(/on\w+\s*=\s*(['"]).*?\1/gi, '')
    .trim()
    .slice(0, maxLen);
}

export function checkProfanityAndBannedWords(
  text: string,
  adminBannedWords: readonly string[] = [],
): { flagged: boolean; reason: string | null } {
  for (const pattern of DEFAULT_PROFANITY_PATTERNS) {
    if (pattern.test(text)) {
      return { flagged: true, reason: 'Matched automatic profanity/harassment filter' };
    }
  }
  const lower = text.toLowerCase();
  for (const word of adminBannedWords) {
    const clean = word.trim().toLowerCase();
    if (clean && lower.includes(clean)) {
      return { flagged: true, reason: `Matched banned term: ${clean}` };
    }
  }
  return { flagged: false, reason: null };
}

const URL_REGEX = /https?:\/\/[^\s<>)"']+/gi;

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_REGEX);
  return matches ? Array.from(new Set(matches)) : [];
}

export function assertSafeCommunityLinks(
  text: string,
  accountCreatedAt: Date,
  adminBlockDomains: readonly string[] = [],
): void {
  const urls = extractUrls(text);
  const ageMs = Date.now() - accountCreatedAt.getTime();
  if (ageMs < 24 * 60 * 60 * 1000 && urls.length > 1) {
    throw new Error('NEW_ACCOUNT_LINK_LIMIT');
  }
  for (const url of urls) {
    if (isDomainDenied(url, adminBlockDomains)) {
      throw new Error(`DENIED_DOMAIN:${extractDomain(url)}`);
    }
  }
}

export function buildSafeLinkPreview(
  text: string,
  adminBlockDomains: readonly string[] = [],
): { url: string; domain: string } | null {
  const urls = extractUrls(text);
  for (const raw of urls) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      if (isDomainDenied(parsed.toString(), adminBlockDomains)) continue;
      const domain = extractDomain(parsed.toString());
      if (!domain || domain === 'localhost' || domain.endsWith('.local')) continue;
      return { url: parsed.toString(), domain };
    } catch {
      continue;
    }
  }
  return null;
}

export function helperBadgeForCount(helpedCount: number): string | null {
  if (helpedCount >= 25) return 'Mentor';
  if (helpedCount >= 10) return 'Guide';
  if (helpedCount >= 3) return 'Helper';
  if (helpedCount >= 1) return 'Contributor';
  return null;
}
