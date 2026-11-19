import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyMathsDictation,
  applySpokenPunctuation,
  insertAtCursor,
  mergeTranscriptSegment,
} from './mathsDictation';
import { useDictation } from './useDictation';

describe('mathsDictation & transcript helpers', () => {
  it('applies spoken punctuation keywords', () => {
    expect(
      applySpokenPunctuation('Hello world comma how are you question mark new line Next'),
    ).toBe('Hello world, how are you?\nNext');
  });

  it('converts spoken maths phrases into readable expressions', () => {
    expect(applyMathsDictation('x squared plus two x equals eight')).toBe('x^2 + 2x = 8');
    expect(applyMathsDictation('square root of x minus three greater than zero')).toBe(
      'sqrt(x) - 3 > 0',
    );
  });

  it('deduplicates repeated/overlapping transcript segments', () => {
    expect(mergeTranscriptSegment('Solve x squared', 'Solve x squared')).toBe('Solve x squared');
    expect(mergeTranscriptSegment('Solve the equation', 'the equation for x')).toBe(
      'Solve the equation for x',
    );
  });

  it('inserts dictated text at cursor position without erasing existing text', () => {
    const res = insertAtCursor('Hello world', 'my', 6, 6);
    expect(res.nextValue).toBe('Hello my world');
  });
});

describe('useDictation hook', () => {
  let latestInstance: {
    onresult: ((e: unknown) => void) | null;
    onerror: ((e: unknown) => void) | null;
    onend: (() => void) | null;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    abort: ReturnType<typeof vi.fn>;
  } | null = null;

  beforeEach(() => {
    window.localStorage.setItem('learnspace:mic-explained', '1');
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });

    const instance = {
      continuous: false,
      interimResults: false,
      lang: 'en-GH',
      onresult: null as ((e: unknown) => void) | null,
      onerror: null as ((e: unknown) => void) | null,
      onend: null as (() => void) | null,
      start: vi.fn(),
      stop: vi.fn(() => {
        instance.onend?.();
      }),
      abort: vi.fn(),
    };
    latestInstance = instance;

    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = function MockSR() {
      return instance;
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    latestInstance = null;
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  it('starts, commits deduplicated speech, stops, and cancels restoring pre-dictation text', async () => {
    let current = 'Initial: ';
    const onChange = vi.fn((next: string) => {
      current = next;
    });

    const { result, rerender } = renderHook(({ val }) => useDictation({ value: val, onChange }), {
      initialProps: { val: current },
    });

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe('listening');
    expect(latestInstance?.start).toHaveBeenCalled();

    act(() => {
      latestInstance?.onresult?.({
        resultIndex: 0,
        results: {
          length: 1,
          0: { isFinal: true, length: 1, 0: { transcript: 'x squared plus two x equals eight' } },
        },
      });
    });
    rerender({ val: current });
    expect(current).toBe('Initial: x^2 + 2x = 8');

    act(() => {
      result.current.cancel();
    });
    rerender({ val: current });
    expect(result.current.status).toBe('idle');
    expect(current).toBe('Initial: ');
  });
});
