import { describe, expect, it } from 'vitest';
import {
  buildUserPrompt,
  suggestConversationTitle,
  trimHistory,
} from '../../src/modules/ai/ai.prompts';

describe('ai.prompts', () => {
  it('T-AI-07: builds prompt templates for quick actions and optional selection', () => {
    const simple = buildUserPrompt('Recursion', 'explain_simple');
    expect(simple).toContain('Explain this simply');
    expect(simple).toContain('Recursion');

    const withSelection = buildUserPrompt('Clarify this', 'example', 'O(n log n)');
    expect(withSelection).toContain('worked example');
    expect(withSelection).toContain('Focused excerpt:');
    expect(withSelection).toContain('O(n log n)');
    expect(withSelection).toContain('Clarify this');

    const quiz = buildUserPrompt('', 'quiz_me');
    expect(quiz).toContain('3 short practice questions');
  });

  it('T-AI-08: trimHistory keeps at most 20 newest messages and respects char cap', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `msg-${i}`,
    }));
    const trimmed = trimHistory(many, 20, 24_000);
    expect(trimmed).toHaveLength(20);
    expect(trimmed[0]?.content).toBe('msg-10');
    expect(trimmed[19]?.content).toBe('msg-29');

    const large = [
      { role: 'user' as const, content: 'a'.repeat(500) },
      { role: 'assistant' as const, content: 'b'.repeat(500) },
      { role: 'user' as const, content: 'c'.repeat(200) },
    ];
    const capped = trimHistory(large, 20, 750);
    expect(capped).toHaveLength(2);
    expect(capped[0]?.content).toBe('b'.repeat(500));
    expect(capped[1]?.content).toBe('c'.repeat(200));
  });

  it('suggestConversationTitle trims and falls back cleanly', () => {
    expect(suggestConversationTitle('  Explain   binary   search trees  ')).toBe(
      'Explain binary search trees',
    );
    expect(suggestConversationTitle('', 'quiz_me')).toBe('Practice quiz');
    expect(suggestConversationTitle('x'.repeat(80)).length).toBeLessThanOrEqual(60);
  });
});

