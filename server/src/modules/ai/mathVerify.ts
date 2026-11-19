const MATH_KEYWORDS_RE =
  /(\bsolve\b|\bequation\b|\bintegral\b|\bderivative\b|\blimit\b|\bmatrix\b|\bquadratic\b|\btrig|\bprobability\b|\bcalculate\b|\bevaluate\b|\bfactor\b|\bsimplify\b|[=^∫∑√]|\\frac|\\int|\\lim|\\sum)/i;

/**
 * Returns true when the user prompt looks like a maths/science problem that benefits
 * from a larger output token budget and answer verification.
 */
export function isMathProblem(prompt: string): boolean {
  return MATH_KEYWORDS_RE.test(prompt);
}

function normalizeImplicitMultiplication(expr: string): string {
  return expr
    .replace(/\s+/g, '')
    .replace(/(\d)([a-zA-Z(])/g, '$1*$2')
    .replace(/([a-zA-Z)])(\d)/g, '$1*$2')
    .replace(/(\))(\()/g, '$1*$2');
}

export interface MathVerificationResult {
  checked: boolean;
  verified: boolean;
  detail?: string;
}

/**
 * Verifies single-variable algebraic equation solutions (e.g., "Solve 2x^2 = 8")
 * by substituting candidate values from the AI's Answer line back into lhs - rhs via mathjs.
 */
export async function verifyMathAnswer(
  prompt: string,
  responseText: string,
): Promise<MathVerificationResult> {
  const eqMatch = prompt.match(
    /([a-zA-Z0-9+\-*/^().]+(?:\s*[+\-*/^]\s*[a-zA-Z0-9+\-*/^().]+)*)\s*=\s*([a-zA-Z0-9+\-*/^().]+(?:\s*[+\-*/^]\s*[a-zA-Z0-9+\-*/^().]+)*)/,
  );
  if (!eqMatch?.[1] || !eqMatch[2]) {
    return { checked: false, verified: true };
  }

  const lhs = normalizeImplicitMultiplication(eqMatch[1]);
  const rhs = normalizeImplicitMultiplication(eqMatch[2]);

  // Identify single-letter variable (excluding e/i if unused, prefer x/y/t/n)
  const vars = Array.from(new Set((lhs + rhs).match(/[a-zA-Z]/g) ?? [])).filter(
    (v) => v !== 'e' && v !== 'i',
  );
  if (vars.length !== 1) {
    return { checked: false, verified: true };
  }
  const variable = vars[0]!;

  // Look for "Answer:" line or final section assigning variable = number
  const answerMatch =
    responseText.match(/\*\*Answer[:\s]*([^\n*]+)\*\*/i) ??
    responseText.match(/Answer:\s*([^\n]+)/i);
  const searchRegion = answerMatch?.[1] ?? responseText.slice(-300);

  const valueMatches = Array.from(
    searchRegion.matchAll(new RegExp(`\\b${variable}\\s*=\\s*([-+]?\\d+(?:\\.\\d+)?)`, 'g')),
  );
  if (valueMatches.length === 0) {
    return { checked: false, verified: true };
  }

  try {
    const { evaluate } = await import('mathjs');
    const residualExpr = `(${lhs}) - (${rhs})`;
    for (const m of valueMatches) {
      const num = Number(m[1]);
      if (!Number.isFinite(num)) continue;
      const residual = Number(evaluate(residualExpr, { [variable]: num }));
      if (!Number.isFinite(residual) || Math.abs(residual) > 1e-5) {
        return {
          checked: true,
          verified: false,
          detail: `Substituting ${variable} = ${num} into ${eqMatch[1].trim()} = ${eqMatch[2].trim()} gives residual ${residual}.`,
        };
      }
    }
    return { checked: true, verified: true };
  } catch {
    return { checked: false, verified: true };
  }
}
