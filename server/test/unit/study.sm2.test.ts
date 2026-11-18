import { describe, expect, it } from 'vitest';
import {
  computeSm2Review,
  formatIntervalHint,
  MAX_CSV_IMPORT_ROWS,
  parseFlashcardCsv,
} from '../../src/modules/study/study.sm2';

describe('SM-2 spaced repetition algorithm', () => {
  const now = new Date('2026-11-18T12:00:00.000Z');

  it('schedules first-time Good -> 1d, second Good -> 6d, third Good -> ~round(6 * ef)', () => {
    const first = computeSm2Review(
      { easeFactor: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 },
      'good',
      now,
    );
    expect(first.nextInterval).toBe(1);
    expect(first.repetitions).toBe(1);
    expect(first.lapses).toBe(0);
    expect(first.easeFactor).toBe(2.5);
    expect(first.dueAt.toISOString()).toBe('2026-11-19T12:00:00.000Z');

    const second = computeSm2Review(
      {
        easeFactor: first.easeFactor,
        intervalDays: first.nextInterval,
        repetitions: first.repetitions,
        lapses: first.lapses,
      },
      'good',
      now,
    );
    expect(second.nextInterval).toBe(6);
    expect(second.repetitions).toBe(2);
    expect(second.dueAt.toISOString()).toBe('2026-11-24T12:00:00.000Z');

    const third = computeSm2Review(
      {
        easeFactor: second.easeFactor,
        intervalDays: second.nextInterval,
        repetitions: second.repetitions,
        lapses: second.lapses,
      },
      'good',
      now,
    );
    expect(third.nextInterval).toBe(15);
    expect(third.repetitions).toBe(3);
  });

  it('resets repetitions and increments lapses on Again, scheduling 10 minutes out', () => {
    const outcome = computeSm2Review(
      { easeFactor: 2.5, intervalDays: 14, repetitions: 4, lapses: 1 },
      'again',
      now,
    );
    expect(outcome.repetitions).toBe(0);
    expect(outcome.lapses).toBe(2);
    expect(outcome.nextInterval).toBe(0);
    expect(outcome.easeFactor).toBe(2.3);
    expect(outcome.dueAt.toISOString()).toBe('2026-11-18T12:10:00.000Z');
  });

  it('gives strictly increasing ease/interval spread for Hard < Good < Easy and floors EF at 1.3', () => {
    const state = { easeFactor: 1.35, intervalDays: 10, repetitions: 3, lapses: 0 };
    const hard = computeSm2Review(state, 'hard', now);
    const good = computeSm2Review(state, 'good', now);
    const easy = computeSm2Review(state, 'easy', now);

    expect(hard.easeFactor).toBe(1.3);
    expect(good.easeFactor).toBe(1.35);
    expect(easy.easeFactor).toBe(1.45);
    expect(hard.nextInterval).toBeLessThan(good.nextInterval);
    expect(good.nextInterval).toBeLessThan(easy.nextInterval);
  });

  it('formats friendly interval hints', () => {
    expect(formatIntervalHint(0)).toBe('10m');
    expect(formatIntervalHint(1)).toBe('1d');
    expect(formatIntervalHint(6)).toBe('6d');
    expect(formatIntervalHint(45)).toBe('2mo');
    expect(formatIntervalHint(400)).toBe('1y');
  });
});

describe('Flashcard CSV parser', () => {
  it('parses quoted multiline CSV fields, BOMs, and optional topic column', () => {
    const csv = `\uFEFFFront,Back,Topic\r\n"What is a ""mutex""?","Ensures mutual exclusion,\none thread at a time",Concurrency\r\nSemaphore,Signaling primitive,`;
    const parsed = parseFlashcardCsv(csv, true);
    expect(parsed.skippedRows).toBe(0);
    expect(parsed.cards).toEqual([
      {
        front: 'What is a "mutex"?',
        back: 'Ensures mutual exclusion,\none thread at a time',
        topic: 'Concurrency',
      },
      {
        front: 'Semaphore',
        back: 'Signaling primitive',
        topic: null,
      },
    ]);
  });

  it('supports headerless CSV and skips blank-back rows', () => {
    const csv = `HTTP 200,OK\nBadRow,\nHTTP 404,Not Found`;
    const parsed = parseFlashcardCsv(csv, false);
    expect(parsed.skippedRows).toBe(1);
    expect(parsed.cards).toHaveLength(2);
  });

  it('rejects unclosed quotes and batches exceeding MAX_CSV_IMPORT_ROWS', () => {
    expect(() => parseFlashcardCsv('"unclosed,row', false)).toThrow(/unclosed quote/i);
    const rows = Array.from({ length: MAX_CSV_IMPORT_ROWS + 1 }, (_, i) => `Q${i},A${i}`).join(
      '\n',
    );
    expect(() => parseFlashcardCsv(rows, false)).toThrow(/limited to 200/i);
  });
});
