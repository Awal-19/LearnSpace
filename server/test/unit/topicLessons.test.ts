import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import type { LLMProvider } from '../../src/lib/llm/provider';
import {
  enqueueTopicLessonJob,
  extractJsonObject,
  generateTopicLessonContent,
  getInflightLessonJob,
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

function createMockPrisma(initialRow: Record<string, unknown> | null = null) {
  let row = initialRow;
  return {
    getRow: () => row,
    prisma: {
      topicLesson: {
        findUnique: vi.fn().mockImplementation(async () => row),
        create: vi.fn().mockImplementation(async ({ data }) => {
          row = {
            id: 'lesson-1',
            version: 1,
            opensCount: 0,
            generatedAt: new Date(),
            reviewedAt: null,
            updatedAt: new Date(),
            ...data,
          };
          return row;
        }),
        update: vi.fn().mockImplementation(async ({ data }) => {
          row = {
            ...(row ?? { id: 'lesson-1' }),
            ...data,
            version:
              typeof data.version === 'object' && data.version?.increment
                ? Number((row as { version?: number })?.version ?? 1) + 1
                : (data.version ?? (row as { version?: number })?.version ?? 1),
          };
          return row;
        }),
        updateMany: vi.fn().mockImplementation(async ({ data }) => {
          if (!row) return { count: 0 };
          row = { ...row, ...data };
          return { count: 1 };
        }),
      },
      usageEvent: { create: vi.fn().mockResolvedValue({}) },
    } as unknown as PrismaClient,
  };
}

describe('SHS Topic Lessons', () => {
  it('extracts JSON from fenced/prose output and rejects truncated JSON', () => {
    const fenced = 'Here is the lesson:\n```json\n{"title":"Algebra","ok":true,}\n```\nEnjoy!';
    expect(extractJsonObject(fenced)).toEqual({ title: 'Algebra', ok: true });
    expect(() => extractJsonObject('{"title":"Algebra",')).toThrow();
  });

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

  it('passes responseMimeType application/json, deduplicates concurrent opens, and serves from DB afterward', async () => {
    const mock = createMockPrisma();
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
      generateTopicLessonContent({
        prisma: mock.prisma,
        llm,
        logger,
        userId: 'u1',
        topic: topicFixture,
        retryBaseDelayMs: 5,
      }),
      generateTopicLessonContent({
        prisma: mock.prisma,
        llm,
        logger,
        userId: 'u2',
        topic: topicFixture,
        retryBaseDelayMs: 5,
      }),
    ]);

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(generateText.mock.calls[0]?.[1]).toMatchObject({
      responseMimeType: 'application/json',
      maxOutputTokens: 8192,
    });
    expect(first.id).toBe('lesson-1');
    expect(second.id).toBe('lesson-1');

    const third = await generateTopicLessonContent({
      prisma: mock.prisma,
      llm,
      logger,
      userId: 'u3',
      topic: topicFixture,
    });
    expect(generateText).toHaveBeenCalledTimes(1);
    expect(third.id).toBe('lesson-1');
  });

  it('retries invalid/truncated JSON and transient 429 provider errors with backoff', async () => {
    const mock = createMockPrisma();
    const rateLimitErr = Object.assign(new Error('429 Too Many Requests'), { status: 429 });
    const generateText = vi
      .fn()
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValueOnce({
        text: '{"title":"Truncated"',
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
      prisma: mock.prisma,
      llm,
      logger,
      userId: 'u1',
      topic: topicFixture,
      retryBaseDelayMs: 5,
    });
    expect(generateText).toHaveBeenCalledTimes(3);
    expect(res.jobStatus).toBe('ready');
  });

  it('saves lesson as needs_review when mathjs verification still mismatches after retry', async () => {
    const mock = createMockPrisma();
    const mathBadLesson: TopicLessonContent = {
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

    const generateText = vi.fn().mockResolvedValue({
      text: JSON.stringify(mathBadLesson),
      usage: { inputTokens: 40, outputTokens: 100 },
    });
    const llm = {
      isConfigured: () => true,
      modelName: 'gemini-test',
      generateText,
    } as unknown as LLMProvider;

    const res = await generateTopicLessonContent({
      prisma: mock.prisma,
      llm,
      logger,
      userId: 'u1',
      topic: topicFixture,
      retryBaseDelayMs: 5,
    });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(res.status).toBe('needs_review');
    expect(res.jobStatus).toBe('ready');
  });

  it('reclaims expired stuck locks and skips active locks', async () => {
    const expiredMock = createMockPrisma({
      id: 'lesson-stuck',
      topicId: 'topic-1',
      contentJson: {},
      status: 'draft',
      jobStatus: 'generating',
      generationLockedUntil: new Date(Date.now() - 60_000),
      generationError: null,
    });

    const generateText = vi.fn().mockResolvedValue({
      text: JSON.stringify(SAMPLE_LESSON),
      usage: { inputTokens: 10, outputTokens: 20 },
    });
    const llm = {
      isConfigured: () => true,
      modelName: 'gemini-test',
      generateText,
    } as unknown as LLMProvider;

    await enqueueTopicLessonJob({
      prisma: expiredMock.prisma,
      llm,
      logger,
      userId: 'u1',
      topic: topicFixture,
      retryBaseDelayMs: 5,
    });
    const pending = getInflightLessonJob(topicFixture.id);
    if (pending) await pending;

    expect(generateText).toHaveBeenCalledTimes(1);
    expect((expiredMock.getRow() as { jobStatus?: string })?.jobStatus).toBe('ready');

    // Active lock should NOT start another job
    const activeMock = createMockPrisma({
      id: 'lesson-active',
      topicId: 'topic-active',
      contentJson: {},
      status: 'draft',
      jobStatus: 'generating',
      generationLockedUntil: new Date(Date.now() + 60_000),
      generationError: null,
    });
    await enqueueTopicLessonJob({
      prisma: activeMock.prisma,
      llm,
      logger,
      userId: 'u1',
      topic: { ...topicFixture, id: 'topic-active' },
      retryBaseDelayMs: 5,
    });
    expect(generateText).toHaveBeenCalledTimes(1);
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
