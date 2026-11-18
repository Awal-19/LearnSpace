import type { ReviewRating } from '@prisma/client';
import { AppError } from '../../lib/errors';

export interface Sm2CardState {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  lapses: number;
}

export interface Sm2ReviewOutcome {
  rating: ReviewRating;
  quality: number;
  previousInterval: number;
  nextInterval: number;
  easeFactor: number;
  repetitions: number;
  lapses: number;
  dueAt: Date;
  lastReviewedAt: Date;
}

export const RATING_QUALITY: Record<ReviewRating, number> = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
};

const SM2_GRADE: Record<ReviewRating, number> = {
  again: 1,
  hard: 3,
  good: 4,
  easy: 5,
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Computes the next SM-2 spaced-repetition state for a card given the user's rating.
 * - `again`: resets repetitions, increments lapses, schedules 10 minutes ahead.
 * - `hard` / `good` / `easy`: advances repetition count, updates easeFactor (floored at 1.3),
 *   and schedules next review `intervalDays` days ahead.
 */
export function computeSm2Review(
  state: Sm2CardState,
  rating: ReviewRating,
  now: Date = new Date(),
): Sm2ReviewOutcome {
  const prevInterval = Math.max(0, Math.round(state.intervalDays));
  const currentEf = Math.max(1.3, Number.isFinite(state.easeFactor) ? state.easeFactor : 2.5);
  const currentReps = Math.max(0, Math.round(state.repetitions));
  const currentLapses = Math.max(0, Math.round(state.lapses));
  const quality = RATING_QUALITY[rating];

  if (rating === 'again') {
    const nextEf = Math.max(1.3, round2(currentEf - 0.2));
    return {
      rating,
      quality,
      previousInterval: prevInterval,
      nextInterval: 0,
      easeFactor: nextEf,
      repetitions: 0,
      lapses: currentLapses + 1,
      dueAt: new Date(now.getTime() + 10 * 60 * 1000),
      lastReviewedAt: now,
    };
  }

  const q = SM2_GRADE[rating];
  const rawEf = currentEf + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  const nextEf = Math.max(1.3, round2(rawEf));

  let nextInterval: number;
  if (rating === 'hard') {
    if (currentReps === 0) {
      nextInterval = 1;
    } else if (currentReps === 1) {
      nextInterval = 3;
    } else {
      nextInterval = Math.max(
        prevInterval + 1,
        Math.round(prevInterval * Math.max(1.2, currentEf * 0.8)),
      );
    }
  } else if (rating === 'good') {
    if (currentReps === 0) {
      nextInterval = 1;
    } else if (currentReps === 1) {
      nextInterval = 6;
    } else {
      nextInterval = Math.max(prevInterval + 1, Math.round(prevInterval * nextEf));
    }
  } else {
    // easy
    if (currentReps === 0) {
      nextInterval = 4;
    } else if (currentReps === 1) {
      nextInterval = 10;
    } else {
      nextInterval = Math.max(prevInterval + 2, Math.round(prevInterval * nextEf * 1.3));
    }
  }

  return {
    rating,
    quality,
    previousInterval: prevInterval,
    nextInterval,
    easeFactor: nextEf,
    repetitions: currentReps + 1,
    lapses: currentLapses,
    dueAt: addDays(now, nextInterval),
    lastReviewedAt: now,
  };
}

export function formatIntervalHint(intervalDays: number): string {
  if (intervalDays <= 0) return '10m';
  if (intervalDays === 1) return '1d';
  if (intervalDays < 30) return `${intervalDays}d`;
  const months = Math.round(intervalDays / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.round(intervalDays / 365)}y`;
}

export interface ParsedCsvCard {
  front: string;
  back: string;
  topic: string | null;
}

export const MAX_CSV_IMPORT_ROWS = 200;

/** Parses RFC-4180 style CSV text with 2+ columns (`front,back[,topic]`). */
export function parseFlashcardCsv(
  csvText: string,
  hasHeader: boolean,
): {
  cards: ParsedCsvCard[];
  skippedRows: number;
} {
  const normalized = csvText
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i]!;
    const next = normalized[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(currentField);
      currentField = '';
    } else if (ch === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += ch;
    }
  }

  if (inQuotes) {
    throw new AppError('VALIDATION_ERROR', 'CSV has an unclosed quote');
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  const nonEmptyRows = rows.filter((r) => r.some((cell) => cell.trim().length > 0));
  const dataRows = hasHeader ? nonEmptyRows.slice(1) : nonEmptyRows;

  if (dataRows.length === 0) {
    throw new AppError('VALIDATION_ERROR', 'CSV contains no flashcard rows');
  }

  if (dataRows.length > MAX_CSV_IMPORT_ROWS) {
    throw new AppError(
      'VALIDATION_ERROR',
      `CSV import is limited to ${MAX_CSV_IMPORT_ROWS} cards per batch (found ${dataRows.length})`,
    );
  }

  const cards: ParsedCsvCard[] = [];
  let skippedRows = 0;

  for (const row of dataRows) {
    const front = (row[0] ?? '').trim().slice(0, 1000);
    const back = (row[1] ?? '').trim().slice(0, 2000);
    const rawTopic = (row[2] ?? '').trim().slice(0, 160);
    if (!front || !back) {
      skippedRows += 1;
      continue;
    }
    cards.push({
      front,
      back,
      topic: rawTopic || null,
    });
  }

  if (cards.length === 0) {
    throw new AppError(
      'VALIDATION_ERROR',
      'No valid cards found. Ensure each row has both front and back columns.',
    );
  }

  return { cards, skippedRows };
}
