import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '../../src/lib/llm/provider';
import {
  generateTopicLessonContent,
  verifyLessonMathExamples,
  type TopicLessonContent,
} from '../../src/modules/shs/shs.lessons';
import { createShsService } from '../../src/modules/shs/shs.service';

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as unknown as Parameters<typeof createShsService>[0]['logger'];

const SAMPLE_LESSON: TopicLessonContent = {
  title: 'Reading Comprehension & Summary Writing',
  subjectName: 'English Language',
  schoolYear: 'SHS 1',
  strand: 'Reading',
  subStrand: 'Comprehension & Summary',
  estimatedMinutes: 8,
  objectives: [
    'Identify main ideas and supporting details in a passage',
    'Infer the writer’s tone and purpose',
    'Write concise summary sentences in your own words',
  ],
  introduction:
    'Reading comprehension and summary writing are core Paper 2 skills in WASSCE English.',
  sections: [
    {
      id: 'sec-1',
      heading: 'Finding the Main Idea',
      body: 'Read the passage twice: first for the general idea, then carefully for details.',
      keyTerms: [
        {
          term: 'Topic sentence',
          definition: 'The sentence that states the main idea of a paragraph.',
        },
      ],
      formulaOrRule: 'Read the question first, then scan the paragraph for key words.',
      localExample:
        'Imagine reading a Daily Graphic article about cocoa farming in Ashanti Region.',
    },
    {
      id: 'sec-2',
      heading: 'Summary Writing Rules',
      body: 'Write clear, complete sentences in your own words and avoid lifting long phrases.',
      keyTerms: [{ term: 'Paraphrase', definition: 'Restating an idea using your own words.' }],
      formulaOrRule: null,
      localExample: null,
    },
  ],
  workedExamples: [
    {
      id: 'ex-1',
      title: 'Percentage Score Check',
      problem: 'A student scores 18 out of 25 in summary. What percentage is that?',
      steps: ['Divide 18 by 25', 'Multiply by 100'],
      finalAnswer: '72%',
      verificationExpr: '(18 / 25) * 100',
      expectedNumeric: 72,
    },
  ],
  commonMistakes: ['Copying whole sentences from the passage without paraphrasing'],
  rememberThis: ['Always write summary answers in full sentences', 'Check word limits'],
  checkYourself: [
    {
      id: 'q1',
      question: 'What is a topic sentence?',
      answer: 'States the main idea',
      explanation: 'It anchors the paragraph.',
    },
    {
      id: 'q2',
      question: 'Should you copy whole sentences in summary?',
      answer: 'No',
      explanation: 'Always paraphrase.',
    },
    {
      id: 'q3',
      question: 'How many times should you read the passage?',
      answer: 'At least twice',
      explanation: 'Skim first, then read closely.',
    },
  ],
  outsideSyllabus: false,
  disclaimer: 'AI-prepared study notes. Check with your teacher and textbook.',
};

const topicFixture = {
  id: 'topic-1',
  title: 'Reading Comprehension & Summary Writing',
  strand: 'Reading',
  subStrand: null,
  referenceNotes: null,
  schoolYear: 'SHS 1',
  subject: { name: 'English Language', syllabusVersion: 'NaCCA-2024' },
};

describe('SHS Topic Lessons', () => {
  it('verifies worked math examples with mathjs and rejects mismatches', async () => {
    expect(await verifyLessonMathExamples(SAMPLE_LESSON)).toBeNull();

    const badLesson: TopicLessonContent = {
      ...SAMPLE_LESSON,
      workedExamples: [
        {
          id: 'bad-1',
          title: 'Wrong Arithmetic',
          problem: '2 + 2',
          steps: ['Add 2 and 2'],
          finalAnswer: '5',
          verificationExpr: '2 + 2',
          expectedNumeric: 5,
        },
      ],
    };
    const err = await verifyLessonMathExamples(badLesson);
    expect(err).toMatch(/failed math verification/i);
  });

  it('generates once, deduplicates simultaneous first-opens, and serves from DB afterward', async () => {
    let storedLesson: Record<string, unknown> | null = null;
    const prisma = {
      topicLesson: {
        findUnique: vi.fn().mockImplementation(async () => storedLesson),
        upsert: vi.fn().mockImplementation(async ({ create }) => {
          storedLesson = { id: 'lesson-1', ...create };
          return storedLesson;
        }),
      },
      usageEvent: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaClient;

    const generateText = vi.fn().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return {
        text: JSON.stringify(SAMPLE_LESSON),
        usage: { inputTokens: 100, outputTokens: 200 },
      };
    });
    const llm = {
      isConfigured: () => true,
      modelName: 'gemini-test',
      generateText,
    } as unknown as LLMProvider;

    const [first, second] = await Promise.all([
      generateTopicLessonContent({ prisma, llm, logger, userId: 'u1', topic: topicFixture }),
      generateTopicLessonContent({ prisma, llm, logger, userId: 'u2', topic: topicFixture }),
    ]);

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(first.id).toBe('lesson-1');
    expect(second.id).toBe('lesson-1');

    // Subsequent call serves from DB without calling AI
    const third = await generateTopicLessonContent({
      prisma,
      llm,
      logger,
      userId: 'u3',
      topic: topicFixture,
    });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(third.id).toBe('lesson-1');
  });

  it('retries invalid AI JSON output and succeeds on valid second attempt', async () => {
    const prisma = {
      topicLesson: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(async ({ create }) => ({ id: 'lesson-2', ...create })),
      },
      usageEvent: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaClient;

    const generateText = vi
      .fn()
      .mockResolvedValueOnce({
        text: 'NOT VALID JSON',
        usage: { inputTokens: 10, outputTokens: 5 },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify(SAMPLE_LESSON),
        usage: { inputTokens: 50, outputTokens: 150 },
      });

    const llm = {
      isConfigured: () => true,
      modelName: 'gemini-test',
      generateText,
    } as unknown as LLMProvider;

    const res = await generateTopicLessonContent({
      prisma,
      llm,
      logger,
      userId: 'u1',
      topic: topicFixture,
    });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(res.id).toBe('lesson-2');
  });

  it('saves progress and reports lesson mistakes', async () => {
    const upsert = vi.fn().mockResolvedValue({ status: 'completed', positionPct: 100 });
    const createReport = vi.fn().mockResolvedValue({ id: 'rep-1', status: 'open' });
    const prisma = {
      lessonProgress: { findUnique: vi.fn().mockResolvedValue(null), upsert },
      subjectTopic: { findUnique: vi.fn().mockResolvedValue({ id: 'topic-1' }) },
      lessonReport: { create: createReport },
    } as unknown as PrismaClient;

    const shs = createShsService({ prisma, logger });
    const prog = await shs.updateLessonProgress('u1', 'topic-1', {
      status: 'completed',
      positionPct: 100,
      addSeconds: 120,
    });
    expect(prog.status).toBe('completed');
    expect(upsert).toHaveBeenCalled();

    const rep = await shs.reportLessonMistake('u1', 'topic-1', 'Typo in Example 1');
    expect(rep.status).toBe('open');
    expect(createReport).toHaveBeenCalled();
  });
});
