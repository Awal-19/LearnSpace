import type { PrismaClient, RecommendationCategory, RecommendationJobStatus } from '@prisma/client';
import type { Logger } from 'pino';
import { AppError } from '../../lib/errors';
import type { RecommendationJobQueue } from './recommendations.jobs';

export interface PublicRecommendation {
  id: string;
  courseId: string;
  category: RecommendationCategory;
  title: string;
  authors: string | null;
  edition: string | null;
  year: number | null;
  institutionOrBody: string | null;
  paperType: string | null;
  topics: string[];
  url: string;
  sourceDomain: string;
  accessType: 'free' | 'preview' | 'borrow' | 'paid';
  reason: string;
  status: 'active' | 'saved' | 'hidden' | 'dead';
  score: number;
  lastCheckedAt: Date | null;
  createdAt: Date;
}

export interface PublicCourseResource {
  id: string;
  courseId: string;
  recommendationId: string | null;
  category: RecommendationCategory;
  title: string;
  authors: string | null;
  year: number | null;
  url: string;
  sourceDomain: string;
  accessType: 'free' | 'preview' | 'borrow' | 'paid';
  reason: string | null;
  createdAt: Date;
}

export interface CourseRecommendationsResponse {
  recommendations: PublicRecommendation[];
  resources: PublicCourseResource[];
  useResourcesInAssistant: boolean;
  latestJob: {
    id: string;
    status: RecommendationJobStatus;
    trigger: string;
    errorCode: string | null;
    errorMessage: string | null;
    resultsCount: number;
    createdAt: Date;
    finishedAt: Date | null;
  } | null;
  dailySearchesUsed: number;
  dailySearchLimit: number;
  featureEnabled: boolean;
  pastQuestionsGuidance: {
    hasPastQuestions: boolean;
    message: string;
    suggestions: string[];
  };
}

export interface RecommendationsService {
  listForCourse(userId: string, courseId: string): Promise<CourseRecommendationsResponse>;
  triggerRefresh(
    userId: string,
    courseId: string,
    options: { mode: 'refresh' | 'find_more'; force?: boolean },
  ): Promise<{
    id: string;
    status: RecommendationJobStatus;
    trigger: string;
    createdAt: Date;
  }>;
  saveRecommendation(
    userId: string,
    courseId: string,
    recommendationId: string,
  ): Promise<PublicCourseResource>;
  removeResource(userId: string, courseId: string, resourceId: string): Promise<void>;
  toggleUseInAssistant(
    userId: string,
    courseId: string,
    useResourcesInAssistant: boolean,
  ): Promise<{ useResourcesInAssistant: boolean }>;
  hideRecommendation(userId: string, courseId: string, recommendationId: string): Promise<void>;
  reportRecommendation(
    userId: string,
    courseId: string,
    recommendationId: string,
    reason: string,
  ): Promise<{ id: string; status: string }>;
}

export function createRecommendationsService(deps: {
  prisma: PrismaClient;
  queue: RecommendationJobQueue;
  logger: Logger;
}): RecommendationsService {
  const { prisma, queue } = deps;

  async function assertCourseOwned(userId: string, courseId: string) {
    const course = await prisma.course.findFirst({
      where: { id: courseId, userId },
      select: { id: true, name: true, useResourcesInAssistant: true },
    });
    if (!course) throw new AppError('NOT_FOUND', 'Course not found');
    return course;
  }

  async function getSettings() {
    return prisma.appSettings.findUnique({ where: { id: 'global' } }).catch(() => null);
  }

  async function getDailySearchesUsed(userId: string): Promise<number> {
    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return prisma.recommendationJob.count({
      where: {
        userId,
        trigger: { in: ['refresh', 'find_more'] },
        createdAt: { gte: dayStart },
      },
    });
  }

  return {
    async listForCourse(userId, courseId) {
      const course = await assertCourseOwned(userId, courseId);
      const [recs, resources, latestJob, settings, dailySearchesUsed] = await Promise.all([
        prisma.courseRecommendation.findMany({
          where: {
            courseId,
            userId,
            hidden: false,
            status: { in: ['active', 'saved'] },
          },
          orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
        }),
        prisma.courseResource.findMany({
          where: { courseId, userId },
          orderBy: { createdAt: 'desc' },
        }),
        prisma.recommendationJob.findFirst({
          where: { courseId, userId },
          orderBy: { createdAt: 'desc' },
        }),
        getSettings(),
        getDailySearchesUsed(userId),
      ]);

      const hasPastQuestions = recs.some((r) => r.category === 'past_question');
      const dailySearchLimit = settings?.dailyCourseSearchLimit ?? 5;
      const featureEnabled = settings?.featureCourseRecommendations ?? true;

      return {
        recommendations: recs.map((r) => ({
          id: r.id,
          courseId: r.courseId,
          category: r.category,
          title: r.title,
          authors: r.authors,
          edition: r.edition,
          year: r.year,
          institutionOrBody: r.institutionOrBody,
          paperType: r.paperType,
          topics: Array.isArray(r.topicsJson)
            ? r.topicsJson.filter((t): t is string => typeof t === 'string')
            : [],
          url: r.url,
          sourceDomain: r.sourceDomain,
          accessType: r.accessType,
          reason: r.reason,
          status: r.status,
          score: r.score,
          lastCheckedAt: r.lastCheckedAt,
          createdAt: r.createdAt,
        })),
        resources: resources.map((res) => ({
          id: res.id,
          courseId: res.courseId,
          recommendationId: res.recommendationId,
          category: res.category,
          title: res.title,
          authors: res.authors,
          year: res.year,
          url: res.url,
          sourceDomain: res.sourceDomain,
          accessType: res.accessType,
          reason: res.reason,
          createdAt: res.createdAt,
        })),
        useResourcesInAssistant: course.useResourcesInAssistant,
        latestJob: latestJob
          ? {
              id: latestJob.id,
              status: latestJob.status,
              trigger: latestJob.trigger,
              errorCode: latestJob.errorCode,
              errorMessage: latestJob.errorMessage,
              resultsCount: latestJob.resultsCount,
              createdAt: latestJob.createdAt,
              finishedAt: latestJob.finishedAt,
            }
          : null,
        dailySearchesUsed,
        dailySearchLimit,
        featureEnabled,
        pastQuestionsGuidance: {
          hasPastQuestions,
          message: hasPastQuestions
            ? 'Public past questions found from open academic repositories.'
            : 'No public past questions found for this course yet. University-specific exam papers are often kept internal.',
          suggestions: [
            'Upload your own past questions on the Documents page to practice with AI.',
            'Generate practice questions from your own lecture slides or notes.',
            'Check official sources: your department, university library repository, course lecturer, or class representative.',
          ],
        },
      };
    },

    async triggerRefresh(userId, courseId, options) {
      await assertCourseOwned(userId, courseId);
      const settings = await getSettings();
      if (settings && settings.featureCourseRecommendations === false) {
        throw new AppError(
          'AI_UNAVAILABLE',
          'Course resource search is currently disabled by an administrator.',
        );
      }

      const activeJob = await prisma.recommendationJob.findFirst({
        where: {
          courseId,
          userId,
          status: { in: ['queued', 'running'] },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (activeJob) {
        return {
          id: activeJob.id,
          status: activeJob.status,
          trigger: activeJob.trigger,
          createdAt: activeJob.createdAt,
        };
      }

      const dailyLimit = settings?.dailyCourseSearchLimit ?? 5;
      const usedToday = await getDailySearchesUsed(userId);
      if (usedToday >= dailyLimit) {
        throw new AppError(
          'RATE_LIMITED',
          `Daily course search limit (${dailyLimit}) reached. Please try again tomorrow.`,
        );
      }

      const trigger = options.mode === 'find_more' ? 'find_more' : 'refresh';
      const job = await queue.enqueue({ courseId, userId, trigger });
      return {
        id: job.id,
        status: job.status,
        trigger: job.trigger,
        createdAt: job.createdAt,
      };
    },

    async saveRecommendation(userId, courseId, recommendationId) {
      await assertCourseOwned(userId, courseId);
      const rec = await prisma.courseRecommendation.findFirst({
        where: { id: recommendationId, courseId, userId },
      });
      if (!rec) throw new AppError('NOT_FOUND', 'Recommendation not found');

      const [resource] = await Promise.all([
        prisma.courseResource.upsert({
          where: { courseId_url: { courseId, url: rec.url } },
          create: {
            courseId,
            userId,
            recommendationId: rec.id,
            category: rec.category,
            title: rec.title,
            authors: rec.authors,
            year: rec.year,
            url: rec.url,
            sourceDomain: rec.sourceDomain,
            accessType: rec.accessType,
            reason: rec.reason,
          },
          update: {
            recommendationId: rec.id,
            title: rec.title,
            authors: rec.authors,
            year: rec.year,
            accessType: rec.accessType,
            reason: rec.reason,
          },
        }),
        prisma.courseRecommendation.update({
          where: { id: rec.id },
          data: { status: 'saved' },
        }),
      ]);

      return {
        id: resource.id,
        courseId: resource.courseId,
        recommendationId: resource.recommendationId,
        category: resource.category,
        title: resource.title,
        authors: resource.authors,
        year: resource.year,
        url: resource.url,
        sourceDomain: resource.sourceDomain,
        accessType: resource.accessType,
        reason: resource.reason,
        createdAt: resource.createdAt,
      };
    },

    async removeResource(userId, courseId, resourceId) {
      await assertCourseOwned(userId, courseId);
      const existing = await prisma.courseResource.findFirst({
        where: { id: resourceId, courseId, userId },
      });
      if (!existing) throw new AppError('NOT_FOUND', 'Course resource not found');

      await prisma.courseResource.delete({ where: { id: existing.id } });
      if (existing.recommendationId) {
        await prisma.courseRecommendation
          .updateMany({
            where: { id: existing.recommendationId, userId, status: 'saved' },
            data: { status: 'active' },
          })
          .catch(() => undefined);
      }
    },

    async toggleUseInAssistant(userId, courseId, useResourcesInAssistant) {
      await assertCourseOwned(userId, courseId);
      const updated = await prisma.course.update({
        where: { id: courseId },
        data: { useResourcesInAssistant },
        select: { useResourcesInAssistant: true },
      });
      return { useResourcesInAssistant: updated.useResourcesInAssistant };
    },

    async hideRecommendation(userId, courseId, recommendationId) {
      await assertCourseOwned(userId, courseId);
      const rec = await prisma.courseRecommendation.findFirst({
        where: { id: recommendationId, courseId, userId },
      });
      if (!rec) throw new AppError('NOT_FOUND', 'Recommendation not found');

      await prisma.courseRecommendation.update({
        where: { id: rec.id },
        data: { hidden: true, status: 'hidden' },
      });
    },

    async reportRecommendation(userId, courseId, recommendationId, reason) {
      await assertCourseOwned(userId, courseId);
      const rec = await prisma.courseRecommendation.findFirst({
        where: { id: recommendationId, courseId, userId },
      });
      if (!rec) throw new AppError('NOT_FOUND', 'Recommendation not found');

      const report = await prisma.recommendationReport.create({
        data: {
          recommendationId: rec.id,
          userId,
          url: rec.url,
          sourceDomain: rec.sourceDomain,
          reason,
          status: 'open',
        },
      });
      return { id: report.id, status: report.status };
    },
  };
}
