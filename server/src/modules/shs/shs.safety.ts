import type { PrismaClient } from '@prisma/client';

export interface ShsScreenResult {
  flagged: boolean;
  category: 'distress' | 'unsafe' | 'pii' | null;
  reason: string | null;
  safeReply?: string;
}

const DISTRESS_PATTERNS: RegExp[] = [
  /\b(kill myself|end my life|suicide|suicidal|want to die|self[- ]?harm|cut myself|hurt myself)\b/i,
  /\b(nobody cares if i die|being abused|someone is hurting me)\b/i,
];

const UNSAFE_PATTERNS: RegExp[] = [
  /\b(porn|pornography|explicit sex|nude photos|send nudes|sexting)\b/i,
  /\b(how to make a bomb|build a weapon|buy illegal drugs|methamphetamine|cocaine recipe)\b/i,
];

const PII_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  {
    label: 'phone_number',
    regex: /(?:\+?233|0)[\s-]?(?:2[034678]|5[0345679])[\s-]?\d{3}[\s-]?\d{4}\b/,
  },
  {
    label: 'email_address',
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  },
  {
    label: 'ghanapost_gps',
    regex: /\b[A-Z]{2}-\d{3,4}-\d{4}\b/,
  },
  {
    label: 'social_handle_or_link',
    regex: /(?:wa\.me\/|t\.me\/|instagram\.com\/|tiktok\.com\/|snapchat\.com\/add\/)/i,
  },
];

export const DISTRESS_SAFE_REPLY =
  "I'm really sorry you're going through a difficult time. You don't have to carry this alone — please talk to a trusted adult right now, such as your parent or guardian, a teacher, or your school guidance counsellor. If you are in immediate danger, please reach out to a trusted adult nearby or local emergency services.";

export const UNSAFE_SAFE_REPLY =
  "I can't help with that request. I'm here to help you with your Ghanaian SHS subjects, homework methods, and WASSCE revision. Let me know which subject or topic you'd like to study!";

export function screenShsChatContent(text: string): ShsScreenResult {
  const input = text.trim();
  if (!input) return { flagged: false, category: null, reason: null };

  for (const rx of DISTRESS_PATTERNS) {
    if (rx.test(input)) {
      return {
        flagged: true,
        category: 'distress',
        reason: 'distress_signal',
        safeReply: DISTRESS_SAFE_REPLY,
      };
    }
  }

  for (const rx of UNSAFE_PATTERNS) {
    if (rx.test(input)) {
      return {
        flagged: true,
        category: 'unsafe',
        reason: 'inappropriate_content',
        safeReply: UNSAFE_SAFE_REPLY,
      };
    }
  }

  return { flagged: false, category: null, reason: null };
}

export function detectShsPii(text: string): string | null {
  for (const { label, regex } of PII_PATTERNS) {
    if (regex.test(text)) return label;
  }
  return null;
}

export async function logShsModerationFlag(
  prisma: PrismaClient,
  params: {
    userId: string;
    source: string;
    direction: 'input' | 'output' | 'community';
    reason: string;
    excerpt: string;
  },
): Promise<void> {
  if (!prisma.shsModerationFlag?.create) return;
  await prisma.shsModerationFlag
    .create({
      data: {
        userId: params.userId,
        source: params.source.slice(0, 40),
        direction: params.direction.slice(0, 20),
        reason: params.reason.slice(0, 200),
        excerpt: params.excerpt.trim().slice(0, 500),
      },
    })
    .catch(() => undefined);
}
