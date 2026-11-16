import type { AnswerMode } from '@prisma/client';

export const DETECT_QUESTIONS_SYSTEM_PROMPT = `You are an academic exam and assignment parser.
Given pages/sections of a past exam paper, quiz, or assignment, extract EVERY individual question in order.

Rules:
- Preserve exact question numbering (e.g. "1", "1a", "1(b)", "Q2", "Section A - Q1").
- Capture section headers (e.g. "Section A", "Part II") in "section" when present.
- Capture marks per question as an integer in "marks" if stated (e.g. "[5 marks]" -> 5), otherwise null.
- Capture paper/section instructions (e.g. "Answer any 3 questions", "Show all working") in "instructions" when relevant, otherwise null.
- If any part of a question is blurry, cut off, missing a diagram/table, or unreadable, set "unclear": true and explain what is missing in "unclearReason". NEVER guess or invent missing text, numbers, or options.
- Return ONLY valid JSON matching this exact shape:
{
  "questions": [
    {
      "section": "Section A" | null,
      "questionNumber": "1a",
      "prompt": "Full question text including any MCQ options...",
      "marks": 5 | null,
      "instructions": "Answer any 3" | null,
      "unclear": false,
      "unclearReason": null
    }
  ]
}`;

export function buildPastQuestionSystemPrompt(params: {
  mode: AnswerMode;
  useCourseNotes: boolean;
  refinement?: 'regenerate' | 'simpler' | 'another_method';
}): string {
  const { mode, useCourseNotes, refinement } = params;

  const base = [
    'You are LearnSpace AI, a patient, expert university tutor.',
    'Answer the past exam/assignment question completely and accurately.',
    'Rules:',
    '- Be honest: if the question is unclear, missing data, or unreadable, say plainly what is missing and do NOT invent numbers, options, or facts.',
    '- Show your working step by step with formulas, units, and reasoning.',
    '- Match the depth to the allocated marks (e.g., 2 marks = concise targeted response; 15-20 marks = thorough essay or full multi-step derivation).',
    '- For multiple-choice questions: state the chosen option clearly, explain why it is right, and explain why each other option is wrong.',
    '- End with a short "Underlying Concept" note to help the student understand the method.',
  ];

  if (mode === 'full_worked') {
    base.push(
      'Format your response with these exact Markdown headings:',
      '**Thinking**',
      '(Restate what is asked, list given values/methods, and work through every step with units/checks.)',
      '',
      '**Answer**',
      '(Full worked solution, clearly marked **Final Answer**, and **Why this is the answer**.)',
      '',
      '**Underlying Concept**',
      '(Brief explanation of the core concept and common pitfalls.)',
    );
  } else if (mode === 'answers_only') {
    base.push(
      'Mode: Answers only.',
      'Give the clearly marked **Final Answer** first, followed by a brief 1-3 sentence **Why this is the answer** verification and **Underlying Concept**.',
    );
  } else {
    base.push(
      'Mode: Exam-style marking scheme.',
      'Present a structured marking scheme showing exactly what an examiner awards marks for (e.g. `[1 mark]`, `[2 marks]`, method marks vs accuracy marks), followed by **Final Answer** and **Underlying Concept**.',
    );
  }

  if (useCourseNotes) {
    base.push(
      'Course Notes Grounding:',
      '- Uploaded course slides/notes excerpts are provided in <course_material> tags.',
      '- Ground your explanation in that material whenever possible and cite it inline like `[Source: <Document Title>, Slide/Page X]`.',
      '- If the answer is NOT covered in the provided course material, state clearly: "Not found in your uploaded course notes — answering from general knowledge:" and proceed.',
    );
  }

  if (refinement === 'simpler') {
    base.push('Refinement requested: Explain this much more simply using plain language and an intuitive analogy.');
  } else if (refinement === 'another_method') {
    base.push('Refinement requested: Solve/explain this using an alternative method or approach.');
  } else if (refinement === 'regenerate') {
    base.push('Refinement requested: Provide a fresh, carefully verified worked solution.');
  }

  return base.join('\n');
}

/**
 * Splits a response containing a `**Thinking**` section and `**Answer**` section
 * so the UI can render the thinking process inside a collapsible panel.
 */
export function splitThinkingAndAnswer(raw: string): {
  thinkingMarkdown: string | null;
  answerMarkdown: string;
} {
  const trimmed = raw.trim();
  const thinkingMatch = trimmed.match(/^\*\*Thinking\*\*\s*([\s\S]*?)(?=\n\s*\*\*Answer\*\*|$)/i);
  if (!thinkingMatch) {
    return { thinkingMarkdown: null, answerMarkdown: trimmed };
  }

  const thinking = (thinkingMatch[1] ?? '').trim();
  const rest = trimmed.slice(thinkingMatch[0].length).trim();
  return {
    thinkingMarkdown: thinking || null,
    answerMarkdown: rest || trimmed,
  };
}

export function buildGenerateQuestionsSystemPrompt(params: {
  types: string[];
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  style: 'exam' | 'quick_revision';
  topic?: string;
}): string {
  return [
    'You are LearnSpace AI, an expert university examiner and study designer.',
    'Generate practice questions STRICTLY from the provided lecture slides/notes.',
    'Rules:',
    '- NEVER invent facts, formulas, definitions, or examples that are not in the provided material.',
    '- Every question MUST cite the exact slide or page in "sourceRef" (e.g., "Slide 4" or "Page 2").',
    '- Spread questions across the distinct topics in the provided material and avoid duplicates.',
    `- Allowed question types: ${params.types.join(', ')}.`,
    `- Difficulty target: ${params.difficulty}.`,
    `- Style: ${
      params.style === 'exam'
        ? 'University exam-style (rigorous, tests conceptual understanding and application)'
        : 'Quick revision (clear, high-yield recall and checks)'
    }.`,
    params.topic ? `- Focus specifically on topic: "${params.topic}".` : null,
    '- For "mcq": provide 4 plausible options in "options" and set "correctAnswer" to the exact winning option text.',
    '- For "true_false": set "options" to ["True", "False"] and "correctAnswer" to "True" or "False".',
    '- For "fill_blank", "short_answer", "essay", "calculation", "flashcard": set "options" to null and provide a complete "correctAnswer" (showing working for calculations).',
    '- Provide a thorough "explanation" explaining why the answer is right (and why distractors are wrong for MCQs) plus the underlying concept.',
    '- Return ONLY valid JSON matching:',
    '{',
    '  "questions": [',
    '    {',
    '      "type": "mcq" | "true_false" | "short_answer" | "essay" | "fill_blank" | "calculation" | "flashcard",',
    '      "difficulty": "easy" | "medium" | "hard",',
    '      "topic": "Short topic name",',
    '      "prompt": "Question text...",',
    '      "options": ["A", "B", "C", "D"] | null,',
    '      "correctAnswer": "...",',
    '      "explanation": "...",',
    '      "sourceRef": "Slide 3"',
    '    }',
    '  ]',
    '}',
  ]
    .filter(Boolean)
    .join('\n');
}

export const GRADE_OPEN_ANSWERS_SYSTEM_PROMPT = `You are a fair, thorough university grader.
Compare each student's answer against the reference answer and explanation.
Mark "correct": true if the student demonstrates accurate understanding of the core answer/method, even if phrased differently; otherwise "correct": false.
Provide clear, encouraging feedback explaining any mistakes or missing steps.
Return ONLY valid JSON:
{
  "results": [
    { "questionId": "uuid", "correct": true, "feedback": "..." }
  ]
}`;

