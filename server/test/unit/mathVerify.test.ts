import { describe, expect, it } from 'vitest';
import { TUTOR_SYSTEM_PROMPT } from '../../src/modules/ai/ai.prompts';
import { isMathProblem, verifyMathAnswer } from '../../src/modules/ai/mathVerify';

describe('mathVerify & maths prompt rules', () => {
  it('detects maths prompts and verifies valid/invalid algebraic solutions via mathjs', async () => {
    expect(isMathProblem('Solve 2x^2 = 8')).toBe(true);
    expect(isMathProblem('What is the capital of Ghana?')).toBe(false);

    const valid = await verifyMathAnswer(
      'Solve 2x^2 = 8',
      '1. Divide by 2.\n\n**Answer: x = 2 or x = -2**\n\nCheck your answer: both satisfy 2x^2 = 8.',
    );
    expect(valid).toEqual({ checked: true, verified: true });

    const invalid = await verifyMathAnswer('Solve 2x^2 = 8', '**Answer: x = 3**');
    expect(invalid.checked).toBe(true);
    expect(invalid.verified).toBe(false);
    expect(invalid.detail).toContain('x = 3');
  });

  it('enforces LaTeX delimiters and 6-step structure in TUTOR_SYSTEM_PROMPT', () => {
    expect(TUTOR_SYSTEM_PROMPT).toContain('$...$');
    expect(TUTOR_SYSTEM_PROMPT).toContain('$$...$$');
    expect(TUTOR_SYSTEM_PROMPT).toContain('Check your answer');
  });
});
