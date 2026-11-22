import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { EmailService } from '../../lib/email';
import { AppError } from '../../lib/errors';
import type { LLMProvider } from '../../lib/llm/provider';
import { generateOpaqueToken, hashToken } from '../../lib/tokens';
import { recordUsageEvent } from '../admin/admin.logging';
import { ensureShsCatalogueSeeded, SHS_SYLLABUS_SOURCE } from './shs.catalogue';

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
  };
}
