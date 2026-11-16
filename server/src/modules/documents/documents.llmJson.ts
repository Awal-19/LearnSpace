import type { z } from 'zod';
import { AppError } from '../../lib/errors';
import type { LLMProvider, TokenUsage } from '../../lib/llm/provider';

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? (fenced[1] ?? '').trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  const jsonSlice = start !== -1 && end > start ? candidate.slice(start, end + 1) : candidate;
  return JSON.parse(jsonSlice);
}

/**
 * Calls the LLM for JSON output, validates with Zod, and retries once on invalid JSON/schema output.
 */
export async function generateJsonWithRetry<T>(
  llm: LLMProvider,
  prompt: string,
  systemPrompt: string,
  schema: z.ZodType<T>,
  maxOutputTokens = 3500,
): Promise<{ data: T; usage: TokenUsage }> {
  let totalInput = 0;
  let totalOutput = 0;
  let lastError = 'Invalid JSON';

  for (let attempt = 0; attempt < 2; attempt++) {
    const attemptPrompt =
      attempt === 0
        ? prompt
        : `${prompt}\n\nIMPORTANT: Your previous response failed validation (${lastError}). Return ONLY valid JSON matching the requested schema.`;

    const res = await llm.generateText(attemptPrompt, {
      systemPrompt,
      responseMimeType: 'application/json',
      temperature: 0.15,
      maxOutputTokens,
    });
    totalInput += res.usage?.inputTokens ?? 0;
    totalOutput += res.usage?.outputTokens ?? 0;

    try {
      const parsed = extractJsonObject(res.text);
      const checked = schema.safeParse(parsed);
      if (checked.success) {
        return {
          data: checked.data,
          usage: { inputTokens: totalInput, outputTokens: totalOutput },
        };
      }
      lastError = checked.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'JSON parse error';
    }
  }

  throw new AppError('AI_BAD_OUTPUT', `AI returned invalid structured output: ${lastError}`);
}

