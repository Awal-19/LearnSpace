import { describe, expect, it } from 'vitest';
import { detectImageMime } from '../../src/lib/storage';
import { computeStreaks, localDateString } from '../../src/modules/users/stats';

describe('computeStreaks', () => {
  it('returns 0 when no study days exist', () => {
    expect(computeStreaks(new Set(), '2026-11-16')).toEqual({
      streakDays: 0,
      longestStreakDays: 0,
    });
  });

  it('counts current streak including today and finds longer historical streak', () => {
    const days = new Set([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-14',
      '2026-11-15',
      '2026-11-16',
    ]);
    expect(computeStreaks(days, '2026-11-16')).toEqual({
      streakDays: 3,
      longestStreakDays: 4,
    });
  });

  it('preserves streak when yesterday was studied even if today has no session yet', () => {
    const days = new Set(['2026-11-14', '2026-11-15']);
    expect(computeStreaks(days, '2026-11-16')).toEqual({
      streakDays: 2,
      longestStreakDays: 2,
    });
  });

  it('resets current streak to 0 when both today and yesterday were missed', () => {
    const days = new Set(['2026-11-10', '2026-11-11', '2026-11-12']);
    expect(computeStreaks(days, '2026-11-16')).toEqual({
      streakDays: 0,
      longestStreakDays: 3,
    });
  });
});

describe('localDateString', () => {
  it('formats dates in the requested timezone and falls back to UTC on invalid timezone', () => {
    const dt = new Date('2026-11-16T23:30:00Z');
    expect(localDateString(dt, 'UTC')).toBe('2026-11-16');
    expect(localDateString(dt, 'Asia/Tokyo')).toBe('2026-11-17');
    expect(localDateString(dt, 'Invalid/Zone')).toBe('2026-11-16');
  });
});

describe('detectImageMime', () => {
  it('detects JPEG, PNG, and WebP magic bytes and rejects executables/text', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    const webp = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'binary');
    const exe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00', 'binary');

    expect(detectImageMime(jpeg)).toBe('image/jpeg');
    expect(detectImageMime(png)).toBe('image/png');
    expect(detectImageMime(webp)).toBe('image/webp');
    expect(detectImageMime(exe)).toBeNull();
    expect(detectImageMime(Buffer.from('short'))).toBeNull();
  });
});

