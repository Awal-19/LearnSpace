import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { EmailService } from '../../lib/email';
import { AppError } from '../../lib/errors';
import type { LLMProvider } from '../../lib/llm/provider';
import { generateOpaqueToken, hashToken } from '../../lib/tokens';
import { recordUsageEvent } from '../admin/admin.logging';
import { ensureShsCatalogueSeeded, SHS_SYLLABUS_SOURCE } from './shs.catalogue';
import { generateTopicLessonContent, type TopicLessonContent } from './shs.lessons';

export interface WassceObjectiveQuestion {
  id: string;
  type: 'objective';
  topic: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface WassceTheoryQuestion {
  id: string;
  type: 'theory';
  topic: string;
  prompt: string;
  marks: number;
  markingScheme: string[];
  modelGuide: string;
}

export type WassceQuestion = WassceObjectiveQuestion | WassceTheoryQuestion;

const OFFICIAL_WASSCE_LINKS = [
  {
    title: 'WAEC Ghana (Official Portal & Chief Examiner Reports)',
    url: 'https://www.waecgh.org',
    source: 'waecgh.org',
  },
  {
    title: 'NaCCA Ghana (Official SHS Curriculum & Syllabi)',
    url: 'https://nacca.gov.gh',
    source: 'nacca.gov.gh',
  },
  {
    title: 'Ghana Education Service (GES)',
    url: 'https://ges.gov.gh',
    source: 'ges.gov.gh',
  },
];

const DAILY_CHALLENGE_BANK = [
  {
    id: 'dc-math-1',
    subject: 'Core Mathematics',
    topic: 'Logarithms',
    prompt: 'If $\\log_{10}(x) = 3$, what is the value of $x$?',
    options: ['30', '100', '1000', '3000'],
    correctIndex: 2,
    explanation: 'By definition, $\\log_{10}(x) = 3$ means $x = 10^3 = 1000$.',
  },
  {
    id: 'dc-sci-1',
    subject: 'Integrated Science',
    topic: 'Photosynthesis',
    prompt: 'Which gas is released as a by-product during photosynthesis in green plants?',
    options: ['Carbon dioxide', 'Nitrogen', 'Oxygen', 'Hydrogen'],
    correctIndex: 2,
    explanation:
      'Plants use carbon dioxide and water in sunlight to produce glucose and release oxygen.',
  },
  {
    id: 'dc-eng-1',
    subject: 'English Language',
    topic: 'Concord (Subject-Verb Agreement)',
    prompt: 'Choose the correct verb: "Neither Kwame nor his friends ____ ready for the quiz."',
    options: ['is', 'was', 'are', 'has been'],
    correctIndex: 2,
    explanation:
      'With "neither...nor", the verb agrees with the nearer subject ("friends", which is plural).',
  },
  {
    id: 'dc-soc-1',
    subject: 'Social Studies',
    topic: 'Constitution & Governance',
    prompt: 'Which arm of government in Ghana is primarily responsible for making laws?',
    options: [
      'The Judiciary',
      'The Legislature (Parliament)',
      'The Executive',
      'The Electoral Commission',
    ],
    correctIndex: 1,
    explanation:
      'Under the 1992 Constitution of Ghana, Parliament (the Legislature) exercises legislative power.',
  },
];

const SHS_TIPS = [
  'Break your study into 25-minute focus blocks with 5-minute breaks — consistency beats cramming.',
  'After reading a topic, close your book and write down 3 key points in your own words.',
  'For WASSCE theory questions, always show your formula and units before substituting numbers.',
  'Revise your weak topics first while your mind is fresh, then review stronger subjects.',
];

export function createShsService(deps: {
  prisma: PrismaClient;
  logger: Logger;
  email?: EmailService;
  clientUrl?: string;
  llm?: LLMProvider;
}) {
  const { prisma, logger, email, clientUrl, llm } = deps;

  return {
    async getCatalogue() {
      await ensureShsCatalogueSeeded(prisma).catch((err) => {
        logger.warn({ err }, 'SHS catalogue seed check failed');
      });

      const [programmes, subjects, settings] = await Promise.all([
        prisma.shsProgramme.findMany({
          where: { active: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        }),
        prisma.subjectCatalogue.findMany({
          where: { active: true },
          orderBy: [{ isCore: 'desc' }, { name: 'asc' }],
          include: {
            topics: {
              where: { active: true },
              orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
              select: { id: true, title: true, schoolYear: true },
            },
          },
        }),
        prisma.appSettings.findUnique({ where: { id: 'global' } }).catch(() => null),
      ]);

      return {
        syllabusSource: settings?.shsSyllabusSource ?? SHS_SYLLABUS_SOURCE,
        programmes: programmes.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          description: p.description,
        })),
        subjects: subjects.map((s) => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          code: s.code,
          isCore: s.isCore,
          programmeSlugs: Array.isArray(s.programmeSlugs)
            ? s.programmeSlugs.filter((x): x is string => typeof x === 'string')
            : [],
          syllabusVersion: s.syllabusVersion,
          sourceCitation: s.sourceCitation,
          topics: s.topics,
        })),
      };
    },

    async selectOnboardingSubjects(
      userId: string,
      input: {
        schoolYear?: string;
        schoolName?: string | null;
        programme?: string | null;
        subjectIds: string[];
        customNames: string[];
      },
    ) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, schoolYear: true },
      });
      if (!user) throw new AppError('UNAUTHENTICATED');

      const year = input.schoolYear ?? user.schoolYear ?? 'SHS 1';
      await prisma.user.update({
        where: { id: userId },
        data: {
          learnerType: 'shs',
          schoolYear: year,
          level: year,
          ...(input.schoolName !== undefined ? { schoolName: input.schoolName } : {}),
          ...(input.programme !== undefined ? { programme: input.programme } : {}),
        },
      });

      const presetSubjects =
        input.subjectIds.length > 0
          ? await prisma.subjectCatalogue.findMany({
              where: { id: { in: input.subjectIds }, active: true },
            })
          : [];

      const createdOrExisting = [];
      const colors = ['#2563EB', '#10B981', '#F59E0B', '#6366F1', '#0EA5E9', '#EC4899', '#14B8A6'];
      let colorIdx = 0;

      for (const subj of presetSubjects) {
        const existing = await prisma.course.findFirst({
          where: { userId, name: { equals: subj.name, mode: 'insensitive' } },
        });
        if (existing) {
          createdOrExisting.push(existing);
          continue;
        }
        const row = await prisma.course.create({
          data: {
            userId,
            name: subj.name.slice(0, 60),
            code: subj.code,
            level: year,
            type: 'subject',
            catalogueSubjectId: subj.id,
            color: colors[colorIdx % colors.length]!,
          },
        });
        colorIdx += 1;
        createdOrExisting.push(row);
      }

      for (const rawName of input.customNames) {
        const name = rawName.trim().slice(0, 60);
        if (!name) continue;
        const existing = await prisma.course.findFirst({
          where: { userId, name: { equals: name, mode: 'insensitive' } },
        });
        if (existing) {
          createdOrExisting.push(existing);
          continue;
        }
        const row = await prisma.course.create({
          data: {
            userId,
            name,
            level: year,
            type: 'subject',
            color: colors[colorIdx % colors.length]!,
          },
        });
        colorIdx += 1;
        createdOrExisting.push(row);
      }

      return {
        schoolYear: year,
        subjectsCount: createdOrExisting.length,
        subjects: createdOrExisting.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          type: c.type,
        })),
      };
    },

    async getConsentStatus(userId: string) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { ageGroup: true, guardianConsentStatus: true },
      });
      if (!user) throw new AppError('UNAUTHENTICATED');

      const latestConsent = await prisma.guardianConsent.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          guardianEmail: true,
          guardianPhone: true,
          createdAt: true,
          consentedAt: true,
          withdrawnAt: true,
        },
      });

      return {
        ageGroup: user.ageGroup,
        guardianConsentStatus: user.guardianConsentStatus,
        latestConsent,
      };
    },

    async requestGuardianConsent(
      userId: string,
      input: { guardianEmail: string; guardianPhone?: string | null },
    ) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, ageGroup: true, guardianConsentStatus: true },
      });
      if (!user) throw new AppError('UNAUTHENTICATED');

      const consentToken = generateOpaqueToken();

      await prisma.$transaction([
        prisma.guardianConsent.updateMany({
          where: { userId, status: 'pending' },
          data: { status: 'withdrawn' },
        }),
        prisma.guardianConsent.create({
          data: {
            userId,
            guardianEmail: input.guardianEmail.trim().toLowerCase(),
            guardianPhone: input.guardianPhone?.trim() || null,
            status: 'pending',
            tokenHash: consentToken.hash,
          },
        }),
        prisma.user.update({
          where: { id: userId },
          data: { guardianConsentStatus: 'pending' },
        }),
      ]);

      const base = (clientUrl ?? '').replace(/\/+$/, '');
      const approveUrl = `${base}/guardian-consent?token=${encodeURIComponent(consentToken.raw)}&action=approve`;
      const withdrawUrl = `${base}/guardian-consent?token=${encodeURIComponent(consentToken.raw)}&action=withdraw`;

      if (email?.sendGuardianConsentEmail) {
        try {
          await email.sendGuardianConsentEmail({
            to: input.guardianEmail.trim().toLowerCase(),
            studentName: user.name,
            approveUrl,
            withdrawUrl,
          });
        } catch (err) {
          logger.error({ err, userId }, 'Failed to send guardian consent email');
        }
      }

      return {
        status: 'pending' as const,
        guardianEmail: input.guardianEmail.trim().toLowerCase(),
      };
    },

    async approveGuardianConsent(token: string, meta: { ip?: string; userAgent?: string }) {
      const hash = hashToken(token);
      const record = await prisma.guardianConsent.findUnique({
        where: { tokenHash: hash },
        include: { user: { select: { id: true, name: true } } },
      });
      if (!record || record.status !== 'pending') {
        throw new AppError(
          'INVALID_TOKEN',
          'This consent link is invalid or has already been used.',
        );
      }

      const now = new Date();
      await prisma.$transaction([
        prisma.guardianConsent.update({
          where: { id: record.id },
          data: {
            status: 'given',
            consentedAt: now,
            ip: meta.ip ?? null,
          },
        }),
        prisma.user.update({
          where: { id: record.userId },
          data: {
            guardianConsentStatus: 'given',
          },
        }),
      ]);

      return { status: 'given' as const, studentName: record.user.name };
    },

    async withdrawGuardianConsent(token: string) {
      const hash = hashToken(token);
      const record = await prisma.guardianConsent.findUnique({
        where: { tokenHash: hash },
        include: { user: { select: { id: true, name: true } } },
      });
      if (!record || record.status === 'withdrawn') {
        throw new AppError('INVALID_TOKEN', 'This withdrawal link is invalid or already used.');
      }

      const now = new Date();
      await prisma.$transaction([
        prisma.guardianConsent.update({
          where: { id: record.id },
          data: {
            status: 'withdrawn',
            withdrawnAt: now,
          },
        }),
        prisma.user.update({
          where: { id: record.userId },
          data: {
            guardianConsentStatus: 'withdrawn',
            tokensValidAfter: now,
          },
        }),
      ]);

      return { status: 'withdrawn' as const, studentName: record.user.name };
    },

    async listWassceAttempts(userId: string) {
      const attempts = await prisma.wassceMockAttempt.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 25,
        include: {
          course: { select: { id: true, name: true, code: true, color: true } },
        },
      });

      const weakTopicMap = new Map<
        string,
        { courseId: string; courseName: string; topic: string; count: number }
      >();
      for (const att of attempts) {
        const weakList = Array.isArray(att.weakTopicsJson)
          ? att.weakTopicsJson.filter((x): x is string => typeof x === 'string')
          : [];
        for (const topic of weakList) {
          const key = `${att.courseId}:${topic.toLowerCase()}`;
          const prev = weakTopicMap.get(key);
          if (prev) {
            prev.count += 1;
          } else {
            weakTopicMap.set(key, {
              courseId: att.courseId,
              courseName: att.course.name,
              topic,
              count: 1,
            });
          }
        }
      }

      return {
        attempts: attempts.map((a) => ({
          id: a.id,
          courseId: a.courseId,
          courseName: a.course.name,
          courseCode: a.course.code,
          format: a.format,
          score: a.score,
          total: a.total,
          weakTopics: Array.isArray(a.weakTopicsJson) ? a.weakTopicsJson : [],
          durationSeconds: a.durationSeconds,
          completedAt: a.completedAt,
          createdAt: a.createdAt,
        })),
        weakTopics: [...weakTopicMap.values()].sort((a, b) => b.count - a.count).slice(0, 12),
        officialSources: OFFICIAL_WASSCE_LINKS,
      };
    },

    async generateWassceMock(
      userId: string,
      input: {
        courseId: string;
        format: 'objective' | 'theory' | 'mixed';
        topics: string[];
        questionCount: number;
      },
    ) {
      if (!llm || !llm.isConfigured()) {
        throw new AppError('AI_UNAVAILABLE', 'AI mock exam generator is not available right now.');
      }

      const course = await prisma.course.findFirst({
        where: { id: input.courseId, userId },
        include: {
          catalogueSubject: {
            include: { topics: { where: { active: true }, take: 12 } },
          },
        },
      });
      if (!course) throw new AppError('NOT_FOUND', 'Subject not found');

      const syllabusTopics =
        input.topics.length > 0
          ? input.topics
          : (course.catalogueSubject?.topics.map((t) => t.title) ?? [course.name]);

      const notes = await prisma.note.findMany({
        where: { userId, courseId: course.id },
        orderBy: { updatedAt: 'desc' },
        take: 4,
        select: { title: true, body: true },
      });
      const notesSummary = notes
        .map((n) => `Note "${n.title}": ${n.body.slice(0, 400)}`)
        .join('\n');

      const formatInstruction =
        input.format === 'objective'
          ? `Generate ${input.questionCount} ORIGINAL WASSCE Paper 1 objective multiple-choice questions (4 options A-D).`
          : input.format === 'theory'
            ? `Generate ${input.questionCount} ORIGINAL WASSCE Paper 2 theory/essay questions with marks and detailed marking scheme points.`
            : `Generate ${input.questionCount} ORIGINAL WASSCE-style questions mixing objective (multiple-choice) and theory (essay/structured) items.`;

      const prompt = [
        `Subject: ${course.name} (Ghanaian SHS / WASSCE level)`,
        `Topics: ${syllabusTopics.join(', ')}`,
        notesSummary ? `Student notes context:\n${notesSummary}` : '',
        formatInstruction,
        'CRITICAL: Write 100% ORIGINAL questions. Do NOT copy WAEC past papers or copyrighted exam questions.',
        'Return ONLY a valid JSON array of objects with NO markdown fences:',
        '- For objective: {"id":"q1","type":"objective","topic":"...","prompt":"...","options":["...","...","...","..."],"correctIndex":0,"explanation":"..."}',
        '- For theory: {"id":"q2","type":"theory","topic":"...","prompt":"...","marks":10,"markingScheme":["Point 1 (2 marks)","..."],"modelGuide":"..."}',
      ]
        .filter(Boolean)
        .join('\n\n');

      const startedAt = Date.now();
      const result = await llm.generateText(prompt, {
        systemPrompt:
          'You are a Ghanaian SHS curriculum assessment writer. Output strict valid JSON only.',
        maxOutputTokens: 3000,
      });

      void recordUsageEvent(prisma, {
        userId,
        feature: 'shs_ai',
        model: llm.modelName,
        tokensIn: result.usage?.inputTokens ?? Math.ceil(prompt.length / 4),
        tokensOut: result.usage?.outputTokens ?? Math.ceil(result.text.length / 4),
        durationMs: Date.now() - startedAt,
        status: 'success',
        route: '/api/v1/shs/wassce/mock',
      });

      const cleaned = result.text
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');

      let parsed: unknown;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        throw new AppError('AI_BAD_OUTPUT', 'Could not parse generated WASSCE mock questions.');
      }
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new AppError('AI_BAD_OUTPUT', 'No mock questions were generated.');
      }

      const questions: WassceQuestion[] = parsed.slice(0, input.questionCount).map((raw, idx) => {
        const q = raw as Record<string, unknown>;
        const id = typeof q.id === 'string' && q.id ? q.id : `q${idx + 1}`;
        const topic =
          typeof q.topic === 'string' && q.topic ? q.topic : (syllabusTopics[0] ?? course.name);
        const qPrompt = typeof q.prompt === 'string' ? q.prompt : 'Question';
        if (q.type === 'theory' || (input.format === 'theory' && q.type !== 'objective')) {
          return {
            id,
            type: 'theory',
            topic,
            prompt: qPrompt,
            marks: typeof q.marks === 'number' ? q.marks : 10,
            markingScheme: Array.isArray(q.markingScheme)
              ? q.markingScheme.filter((x): x is string => typeof x === 'string')
              : ['Clear explanation of key concept (5 marks)'],
            modelGuide: typeof q.modelGuide === 'string' ? q.modelGuide : '',
          };
        }
        const options = Array.isArray(q.options)
          ? q.options.filter((x): x is string => typeof x === 'string').slice(0, 4)
          : ['Option A', 'Option B', 'Option C', 'Option D'];
        while (options.length < 4) options.push(`Option ${options.length + 1}`);
        const correctIndex =
          typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3
            ? q.correctIndex
            : 0;
        return {
          id,
          type: 'objective',
          topic,
          prompt: qPrompt,
          options,
          correctIndex,
          explanation: typeof q.explanation === 'string' ? q.explanation : '',
        };
      });

      const attempt = await prisma.wassceMockAttempt.create({
        data: {
          userId,
          courseId: course.id,
          format: input.format,
          topicsJson: syllabusTopics,
          questionsJson: questions as unknown as object,
          total: questions.filter((q) => q.type === 'objective').length || questions.length,
        },
      });

      return {
        attemptId: attempt.id,
        courseName: course.name,
        format: attempt.format,
        durationMinutes: questions.length * (input.format === 'theory' ? 6 : 2),
        questions: questions.map((q) =>
          q.type === 'objective'
            ? { id: q.id, type: q.type, topic: q.topic, prompt: q.prompt, options: q.options }
            : { id: q.id, type: q.type, topic: q.topic, prompt: q.prompt, marks: q.marks },
        ),
      };
    },

    async submitWassceMock(
      userId: string,
      attemptId: string,
      input: { answers: Record<string, number | string>; durationSeconds: number },
    ) {
      const attempt = await prisma.wassceMockAttempt.findFirst({
        where: { id: attemptId, userId },
      });
      if (!attempt) throw new AppError('NOT_FOUND', 'Mock attempt not found');

      const questions = (Array.isArray(attempt.questionsJson)
        ? attempt.questionsJson
        : []) as unknown as WassceQuestion[];

      let objScore = 0;
      let objTotal = 0;
      const weakSet = new Set<string>();

      for (const q of questions) {
        if (q.type === 'objective') {
          objTotal += 1;
          const ans = input.answers[q.id];
          if (typeof ans === 'number' && ans === q.correctIndex) {
            objScore += 1;
          } else {
            weakSet.add(q.topic);
          }
        } else {
          const ans = input.answers[q.id];
          if (typeof ans !== 'string' || ans.trim().length < 20) {
            weakSet.add(q.topic);
          }
        }
      }

      const weakTopics = [...weakSet];
      const total = objTotal > 0 ? objTotal : questions.length;
      const score = objTotal > 0 ? objScore : null;

      await prisma.wassceMockAttempt.update({
        where: { id: attempt.id },
        data: {
          answersJson: input.answers,
          score,
          total,
          weakTopicsJson: weakTopics,
          durationSeconds: Math.max(0, Math.round(input.durationSeconds)),
          completedAt: new Date(),
        },
      });

      return {
        attemptId: attempt.id,
        score,
        total,
        weakTopics,
        questions,
        answers: input.answers,
      };
    },

    async getShsDashboard(userId: string) {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const todayKey = now.toISOString().slice(0, 10);

      const [
        user,
        courses,
        todayTasks,
        lastNote,
        lastQuizAttempt,
        lastConversation,
        wassceExam,
        focusAgg,
        attempts,
        noteCount,
        chatCount,
        quizCount,
        dailyAnswers,
      ] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, schoolYear: true, programme: true, schoolName: true },
        }),
        prisma.course.findMany({
          where: { userId, archivedAt: null },
          orderBy: { createdAt: 'asc' },
          include: {
            catalogueSubject: {
              include: { topics: { where: { active: true }, select: { id: true, title: true } } },
            },
            _count: { select: { notes: true, quizzes: true, wassceMockAttempts: true } },
          },
        }),
        prisma.task.findMany({
          where: { userId, status: 'todo' },
          orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
          take: 6,
          select: { id: true, title: true, dueAt: true, priority: true, courseId: true },
        }),
        prisma.note.findFirst({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, title: true, updatedAt: true, courseId: true },
        }),
        prisma.quizAttempt.findFirst({
          where: { userId },
          orderBy: { takenAt: 'desc' },
          include: { quiz: { select: { id: true, title: true } } },
        }),
        prisma.conversation.findFirst({
          where: { userId },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, title: true, updatedAt: true },
        }),
        prisma.exam.findFirst({
          where: { userId, startsAt: { gte: now } },
          orderBy: { startsAt: 'asc' },
          select: { id: true, title: true, startsAt: true },
        }),
        prisma.studySession.aggregate({
          where: { userId, startedAt: { gte: weekAgo } },
          _sum: { durationSeconds: true },
        }),
        prisma.wassceMockAttempt.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { course: { select: { id: true, name: true } } },
        }),
        prisma.note.count({ where: { userId } }),
        prisma.conversation.count({ where: { userId } }),
        prisma.quizAttempt.count({ where: { userId } }),
        prisma.activityEvent.findMany({
          where: { userId, action: 'shs_daily_challenge' },
          orderBy: { createdAt: 'desc' },
          take: 30,
          select: { createdAt: true },
        }),
      ]);

      const weakMap = new Map<
        string,
        { courseId: string; courseName: string; topic: string; count: number }
      >();
      for (const att of attempts) {
        const list = Array.isArray(att.weakTopicsJson)
          ? att.weakTopicsJson.filter((x): x is string => typeof x === 'string')
          : [];
        for (const t of list) {
          const key = `${att.courseId}:${t.toLowerCase()}`;
          const prev = weakMap.get(key);
          if (prev) prev.count += 1;
          else
            weakMap.set(key, {
              courseId: att.courseId,
              courseName: att.course.name,
              topic: t,
              count: 1,
            });
        }
      }

      const dayIndex = Math.floor(now.getTime() / (24 * 60 * 60 * 1000));
      const challenge = DAILY_CHALLENGE_BANK[dayIndex % DAILY_CHALLENGE_BANK.length]!;
      const answeredToday = dailyAnswers.some(
        (d) => d.createdAt.toISOString().slice(0, 10) === todayKey,
      );

      const focusSecondsThisWeek = focusAgg._sum.durationSeconds ?? 0;
      const badges = [
        { id: 'first_subject', label: 'Subject Starter', earned: courses.length > 0 },
        { id: 'note_taker', label: 'Note Maker', earned: noteCount > 0 },
        { id: 'wassce_mock', label: 'WASSCE Practiser', earned: attempts.length > 0 },
        { id: 'focus_60m', label: '60m Focus Week', earned: focusSecondsThisWeek >= 3600 },
      ];

      return {
        greetingName: user?.name ?? 'Student',
        schoolYear: user?.schoolYear ?? 'SHS',
        programme: user?.programme ?? null,
        checklist: {
          hasSubject: courses.length > 0,
          hasNote: noteCount > 0,
          hasChat: chatCount > 0,
          hasQuiz: quizCount > 0 || attempts.length > 0,
        },
        wassceTarget: wassceExam
          ? {
              id: wassceExam.id,
              title: wassceExam.title,
              targetDate: wassceExam.startsAt.toISOString(),
              daysLeft: Math.max(
                0,
                Math.ceil((wassceExam.startsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
              ),
            }
          : null,
        subjects: courses.map((c) => {
          const totalTopics = c.catalogueSubject?.topics.length ?? 0;
          const coveredEstimate = Math.min(
            100,
            totalTopics > 0
              ? Math.round(
                  ((c._count.notes + c._count.quizzes + c._count.wassceMockAttempts) /
                    totalTopics) *
                    100,
                )
              : Math.min(100, (c._count.notes + c._count.quizzes) * 25),
          );
          return {
            id: c.id,
            name: c.name,
            color: c.color ?? '#2563EB',
            progressPct: coveredEstimate,
            notesCount: c._count.notes,
            topicsCount: totalTopics,
          };
        }),
        todayTasks,
        continueFrom: {
          lastNote: lastNote
            ? { id: lastNote.id, title: lastNote.title, updatedAt: lastNote.updatedAt }
            : null,
          lastQuiz: lastQuizAttempt
            ? {
                id: lastQuizAttempt.quiz.id,
                title: lastQuizAttempt.quiz.title,
                score: lastQuizAttempt.score,
                total: lastQuizAttempt.total,
              }
            : null,
          lastChat: lastConversation
            ? {
                id: lastConversation.id,
                title: lastConversation.title,
                updatedAt: lastConversation.updatedAt,
              }
            : null,
        },
        dailyChallenge: {
          id: challenge.id,
          subject: challenge.subject,
          topic: challenge.topic,
          prompt: challenge.prompt,
          options: challenge.options,
          answeredToday,
          streak: dailyAnswers.length,
        },
        weakTopics: [...weakMap.values()].sort((a, b) => b.count - a.count).slice(0, 5),
        focusMinutesThisWeek: Math.round(focusSecondsThisWeek / 60),
        streakDays: dailyAnswers.length,
        badges,
        tipOfTheDay: SHS_TIPS[dayIndex % SHS_TIPS.length]!,
      };
    },

    async setWassceTargetDate(userId: string, targetDateIso: string, title = 'WASSCE Target Exam') {
      const target = new Date(targetDateIso);
      if (Number.isNaN(target.getTime())) {
        throw new AppError('VALIDATION_ERROR', 'Invalid WASSCE target date.');
      }
      const course = await prisma.course.findFirst({
        where: { userId, archivedAt: null },
        select: { id: true },
      });
      if (!course) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Add at least one SHS subject before setting an exam date.',
        );
      }
      const existing = await prisma.exam.findFirst({
        where: { userId, title: { contains: 'WASSCE', mode: 'insensitive' } },
      });
      const exam = existing
        ? await prisma.exam.update({
            where: { id: existing.id },
            data: { startsAt: target, title },
          })
        : await prisma.exam.create({
            data: { userId, courseId: course.id, title, examType: 'final', startsAt: target },
          });
      return { id: exam.id, targetDate: exam.startsAt.toISOString(), title: exam.title };
    },

    async answerDailyChallenge(userId: string, challengeId: string, selectedIndex: number) {
      const challenge =
        DAILY_CHALLENGE_BANK.find((c) => c.id === challengeId) ?? DAILY_CHALLENGE_BANK[0]!;
      const correct = selectedIndex === challenge.correctIndex;
      await prisma.activityEvent
        .create({
          data: {
            userId,
            action: 'shs_daily_challenge',
            metadataJson: { challengeId: challenge.id, correct },
          },
        })
        .catch(() => undefined);
      return {
        correct,
        correctIndex: challenge.correctIndex,
        explanation: challenge.explanation,
      };
    },

    async getSubjectTopicsWithProgress(userId: string, courseOrSubjectId: string) {
      const course = await prisma.course.findFirst({
        where: { id: courseOrSubjectId, userId },
        select: { id: true, name: true, catalogueSubjectId: true },
      });

      let subjectId = course?.catalogueSubjectId ?? null;
      if (!subjectId && course) {
        const matched = await prisma.subjectCatalogue.findFirst({
          where: { name: { equals: course.name, mode: 'insensitive' }, active: true },
          select: { id: true },
        });
        subjectId = matched?.id ?? null;
      }
      if (!subjectId) {
        const direct = await prisma.subjectCatalogue.findUnique({
          where: { id: courseOrSubjectId },
          select: { id: true },
        });
        subjectId = direct?.id ?? null;
      }
      if (!subjectId) {
        return { subjectId: null, topics: [] };
      }

      const topics = await prisma.subjectTopic.findMany({
        where: { subjectId, active: true },
        orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
        include: {
          lesson: {
            select: { id: true, status: true, version: true, contentJson: true },
          },
          progresses: {
            where: { userId },
            select: { status: true, positionPct: true, timeSpentSeconds: true, completedAt: true },
          },
        },
      });

      return {
        subjectId,
        topics: topics.map((t) => {
          const content = t.lesson?.contentJson as { estimatedMinutes?: number } | undefined;
          const prog = t.progresses[0];
          return {
            id: t.id,
            title: t.title,
            strand: t.strand ?? 'General Syllabus',
            subStrand: t.subStrand ?? null,
            schoolYear: t.schoolYear,
            lessonReady: Boolean(t.lesson),
            lessonStatus: t.lesson?.status ?? null,
            estimatedMinutes: content?.estimatedMinutes ?? 8,
            progressStatus: prog?.status ?? 'not_started',
            positionPct: prog?.positionPct ?? 0,
            timeSpentSeconds: prog?.timeSpentSeconds ?? 0,
            completedAt: prog?.completedAt ?? null,
          };
        }),
      };
    },

    async getOrCreateTopicLesson(userId: string, topicId: string) {
      if (!llm) throw new AppError('AI_UNAVAILABLE', 'Lesson service unavailable.');
      const topic = await prisma.subjectTopic.findUnique({
        where: { id: topicId },
        include: {
          subject: { select: { id: true, name: true, syllabusVersion: true } },
        },
      });
      if (!topic) throw new AppError('NOT_FOUND', 'Topic not found');

      const lesson = await generateTopicLessonContent({
        prisma,
        llm,
        logger,
        userId,
        topic,
      });

      await Promise.all([
        prisma.topicLesson
          .update({
            where: { id: lesson.id },
            data: { opensCount: { increment: 1 } },
          })
          .catch(() => undefined),
        prisma.lessonProgress
          .upsert({
            where: { userId_topicId: { userId, topicId: topic.id } },
            create: { userId, topicId: topic.id, status: 'in_progress', positionPct: 0 },
            update: {},
          })
          .catch(() => undefined),
      ]);

      const [progress, siblingTopics] = await Promise.all([
        prisma.lessonProgress.findUnique({
          where: { userId_topicId: { userId, topicId: topic.id } },
        }),
        prisma.subjectTopic.findMany({
          where: { subjectId: topic.subjectId, active: true },
          orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
          select: { id: true, title: true },
        }),
      ]);

      const idx = siblingTopics.findIndex((s) => s.id === topic.id);
      return {
        topic: {
          id: topic.id,
          title: topic.title,
          strand: topic.strand,
          subStrand: topic.subStrand,
          schoolYear: topic.schoolYear,
          subjectId: topic.subject.id,
          subjectName: topic.subject.name,
          syllabusVersion: topic.subject.syllabusVersion,
        },
        lesson: {
          id: lesson.id,
          status: lesson.status,
          version: lesson.version,
          model: lesson.model,
          promptVersion: lesson.promptVersion,
          generatedAt: lesson.generatedAt,
          reviewedAt: lesson.reviewedAt,
          content: lesson.contentJson as TopicLessonContent,
        },
        progress: progress ?? {
          status: 'in_progress',
          positionPct: 0,
          timeSpentSeconds: 0,
          completedAt: null,
        },
        prevTopic: idx > 0 ? siblingTopics[idx - 1]! : null,
        nextTopic: idx >= 0 && idx < siblingTopics.length - 1 ? siblingTopics[idx + 1]! : null,
      };
    },

    async updateLessonProgress(
      userId: string,
      topicId: string,
      input: {
        status?: 'not_started' | 'in_progress' | 'completed';
        positionPct?: number;
        addSeconds?: number;
      },
    ) {
      const existing = await prisma.lessonProgress.findUnique({
        where: { userId_topicId: { userId, topicId } },
      });
      const nextStatus =
        input.status ??
        (existing?.status === 'completed'
          ? 'completed'
          : (input.positionPct ?? 0) >= 90
            ? 'completed'
            : 'in_progress');
      const nextPos =
        input.positionPct !== undefined
          ? Math.min(100, Math.max(0, input.positionPct))
          : (existing?.positionPct ?? 0);

      return prisma.lessonProgress.upsert({
        where: { userId_topicId: { userId, topicId } },
        create: {
          userId,
          topicId,
          status: nextStatus,
          positionPct: nextPos,
          timeSpentSeconds: Math.max(0, input.addSeconds ?? 0),
          completedAt: nextStatus === 'completed' ? new Date() : null,
        },
        update: {
          status: nextStatus,
          positionPct: nextPos,
          ...(input.addSeconds
            ? { timeSpentSeconds: { increment: Math.max(0, input.addSeconds) } }
            : {}),
          ...(nextStatus === 'completed' && !existing?.completedAt
            ? { completedAt: new Date() }
            : {}),
        },
      });
    },

    async reportLessonMistake(userId: string, topicId: string, reason: string) {
      const topic = await prisma.subjectTopic.findUnique({ where: { id: topicId } });
      if (!topic) throw new AppError('NOT_FOUND', 'Topic not found');
      return prisma.lessonReport.create({
        data: { userId, topicId, reason: reason.trim().slice(0, 1000) },
      });
    },

    async saveLessonToNotes(
      userId: string,
      topicId: string,
      input: { courseId?: string | null; excerpt?: string | null },
    ) {
      const [topic, lesson] = await Promise.all([
        prisma.subjectTopic.findUnique({
          where: { id: topicId },
          include: { subject: { select: { name: true } } },
        }),
        prisma.topicLesson.findUnique({ where: { topicId } }),
      ]);
      if (!topic || !lesson) throw new AppError('NOT_FOUND', 'Lesson not found');
      const c = lesson.contentJson as unknown as TopicLessonContent;

      const body = input.excerpt?.trim()
        ? `> Selected from ${topic.title} (${topic.subject.name})\n\n${input.excerpt.trim()}`
        : [
            `# ${c.title}`,
            c.introduction,
            ...c.sections.map((s) => `## ${s.heading}\n${s.body}`),
            c.rememberThis.length
              ? `## Remember This\n${c.rememberThis.map((r) => `- ${r}`).join('\n')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n\n');

      return prisma.note.create({
        data: {
          userId,
          courseId: input.courseId ?? null,
          title: `${topic.title} — Study Notes`.slice(0, 150),
          body,
        },
      });
    },

    async createFlashcardsFromLesson(
      userId: string,
      topicId: string,
      input: { courseId?: string | null },
    ) {
      const [topic, lesson] = await Promise.all([
        prisma.subjectTopic.findUnique({ where: { id: topicId } }),
        prisma.topicLesson.findUnique({ where: { topicId } }),
      ]);
      if (!topic || !lesson) throw new AppError('NOT_FOUND', 'Lesson not found');
      const c = lesson.contentJson as unknown as TopicLessonContent;

      const cardsData: Array<{ front: string; back: string; topic: string; position: number }> = [];
      let pos = 0;
      for (const sec of c.sections) {
        for (const kt of sec.keyTerms ?? []) {
          cardsData.push({
            front: kt.term,
            back: kt.definition,
            topic: topic.title,
            position: pos++,
          });
        }
      }
      for (const q of c.checkYourself ?? []) {
        cardsData.push({
          front: q.question,
          back: `${q.answer}\n\n${q.explanation}`,
          topic: topic.title,
          position: pos++,
        });
      }
      if (cardsData.length === 0) {
        cardsData.push({
          front: `Key summary of ${topic.title}`,
          back: c.rememberThis.join('\n'),
          topic: topic.title,
          position: 0,
        });
      }

      const deck = await prisma.deck.create({
        data: {
          userId,
          courseId: input.courseId ?? null,
          title: `${topic.title} Flashcards`.slice(0, 150),
          topic: topic.title,
          cards: { create: cardsData.slice(0, 25) },
        },
      });
      return { deckId: deck.id, cardsCount: Math.min(25, cardsData.length) };
    },

    async createQuizFromLesson(
      userId: string,
      topicId: string,
      input: { courseId?: string | null },
    ) {
      const [topic, lesson] = await Promise.all([
        prisma.subjectTopic.findUnique({ where: { id: topicId } }),
        prisma.topicLesson.findUnique({ where: { topicId } }),
      ]);
      if (!topic || !lesson) throw new AppError('NOT_FOUND', 'Lesson not found');
      const c = lesson.contentJson as unknown as TopicLessonContent;

      const questions = (c.checkYourself ?? []).map((q, i) => ({
        prompt: q.question,
        options:
          q.options && q.options.length >= 2
            ? q.options
            : [q.answer, 'None of the above', 'Cannot be determined', 'All of the above'],
        correctIndex: Math.max(0, (q.options ?? []).indexOf(q.answer)),
        explanation: q.explanation,
        position: i,
      }));

      const quiz = await prisma.quiz.create({
        data: {
          userId,
          courseId: input.courseId ?? null,
          title: `${topic.title} Quick Quiz`.slice(0, 150),
          topic: topic.title,
          questions: { create: questions },
        },
      });
      return { quizId: quiz.id, questionsCount: questions.length };
    },
  };
}
