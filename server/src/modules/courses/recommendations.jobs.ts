import type {
  Prisma,
  PrismaClient,
  RecommendationJob,
  RecommendationJobTrigger,
} from '@prisma/client';
import type { Logger } from 'pino';
import type { LLMProvider } from '../../lib/llm/provider';
import type { WebSearchProvider } from '../../lib/webSearch';
import { recordUsageEvent } from '../admin/admin.logging';
import {
  buildRecommendationCacheKey,
  runRecommendationPipeline,
  type VerifiedRecommendationItem,
} from './recommendations.pipeline';
import { isDomainDenied, verifyPublicHttpUrl } from './recommendations.safety';

const MAX_ATTEMPTS = 2;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface RecommendationJobQueue {
  enqueue(params: {
    courseId: string;
    userId: string;
    trigger: RecommendationJobTrigger;
  }): Promise<RecommendationJob>;
  processNext(): Promise<boolean>;
  processById(jobId: string): Promise<void>;
  recheckStaleLinks(limit?: number): Promise<number>;
  startWorker(intervalMs?: number): void;
  stopWorker(): void;
}

function parseDomainArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === 'string')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function createRecommendationJobQueue(deps: {
  prisma: PrismaClient;
  searchProvider: WebSearchProvider;
  llm?: LLMProvider;
  logger: Logger;
  skipLinkCheck?: boolean;
}): RecommendationJobQueue {
  const { prisma, searchProvider, llm, logger, skipLinkCheck = false } = deps;
  let timer: NodeJS.Timeout | null = null;
  let recheckTimer: NodeJS.Timeout | null = null;
  let polling = false;

  async function processJobRecord(job: RecommendationJob): Promise<void> {
    const startMs = Date.now();
    await prisma.recommendationJob.update({
      where: { id: job.id },
      data: {
        status: 'running',
        attempts: { increment: 1 },
        startedAt: new Date(),
        errorCode: null,
        errorMessage: null,
      },
    });

    try {
      const settings = await prisma.appSettings
        .findUnique({ where: { id: 'global' } })
        .catch(() => null);

      if (settings && settings.featureCourseRecommendations === false) {
        throw Object.assign(
          new Error('Course resource recommendations are currently disabled by an administrator.'),
          { code: 'FEATURE_DISABLED' },
        );
      }

      const course = await prisma.course.findFirst({
        where: { id: job.courseId, userId: job.userId },
        select: { id: true, name: true, code: true, level: true },
      });
      if (!course) {
        await prisma.recommendationJob.update({
          where: { id: job.id },
          data: { status: 'completed', finishedAt: new Date(), resultsCount: 0 },
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: { id: job.userId },
        select: { programme: true, level: true, university: true, learnerType: true },
      });

      const isShs = user?.learnerType === 'shs';
      const adminAllowDomains = parseDomainArray(settings?.recommendationAllowDomainsJson);
      const adminBlockDomains = parseDomainArray(settings?.recommendationBlockDomainsJson);
      const cacheKey = buildRecommendationCacheKey(
        course.name,
        isShs ? 'ghana-shs-wassce' : (course.level ?? user?.level),
      );

      let items: VerifiedRecommendationItem[] = [];
      let searchesRun = 0;
      let tokensIn = 0;
      let tokensOut = 0;
      let usedCache = false;

      if (job.trigger === 'auto_create' || job.trigger === 'refresh') {
        const cached = await prisma.recommendationCache
          .findUnique({ where: { cacheKey } })
          .catch(() => null);
        if (cached && cached.expiresAt > new Date() && Array.isArray(cached.payloadJson)) {
          items = (cached.payloadJson as unknown as VerifiedRecommendationItem[]).filter(
            (i) => !isDomainDenied(i.url, adminBlockDomains),
          );
          usedCache = items.length > 0;
        }
      }

      if (!usedCache) {
        // Check global monthly search cost cap
        const monthStart = new Date(
          Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
        );
        const monthlyCap = settings?.monthlySearchCostCapUsd ?? 25.0;
        if (monthlyCap > 0 && prisma.usageEvent?.aggregate) {
          const agg = await prisma.usageEvent
            .aggregate({
              where: {
                feature: 'course_resource_search',
                createdAt: { gte: monthStart },
              },
              _sum: { costUsd: true },
            })
            .catch(() => null);
          const spent = agg?._sum?.costUsd ?? 0;
          if (spent >= monthlyCap) {
            throw Object.assign(
              new Error('Monthly web search budget cap reached. Feature paused until next month.'),
              { code: 'MONTHLY_CAP_REACHED' },
            );
          }
        }

        if (!searchProvider.isConfigured()) {
          throw Object.assign(new Error('Web search provider is not configured on the server.'), {
            code: 'SEARCH_UNAVAILABLE',
          });
        }

        const pipelineRes = await runRecommendationPipeline({
          input: {
            courseName: course.name,
            code: isShs ? null : course.code,
            level: isShs ? 'Ghana SHS WASSCE' : (course.level ?? user?.level ?? null),
            programme: user?.programme ?? null,
            university: isShs ? 'Ghana Education Service NaCCA' : (user?.university ?? null),
          },
          searchProvider,
          llm,
          logger,
          adminAllowDomains,
          adminBlockDomains,
          mode: job.trigger === 'find_more' ? 'more' : 'initial',
          skipLinkCheck,
        });

        items = pipelineRes.items;
        searchesRun = pipelineRes.searchesRun;
        tokensIn = pipelineRes.llmUsage.inputTokens;
        tokensOut = pipelineRes.llmUsage.outputTokens;

        if (items.length > 0) {
          await prisma.recommendationCache
            .upsert({
              where: { cacheKey },
              create: {
                cacheKey,
                payloadJson: items as unknown as Prisma.InputJsonValue,
                expiresAt: new Date(Date.now() + CACHE_TTL_MS),
              },
              update: {
                payloadJson: items as unknown as Prisma.InputJsonValue,
                expiresAt: new Date(Date.now() + CACHE_TTL_MS),
              },
            })
            .catch(() => undefined);
        }

        await recordUsageEvent(prisma, {
          userId: job.userId,
          feature: 'course_resource_search',
          model: `${pipelineRes.providerName}${llm?.isConfigured() ? `+${llm.modelName}` : ''}`,
          tokensIn,
          tokensOut,
          durationMs: Date.now() - startMs,
          status: 'success',
          route: `job:${job.trigger}`,
        });
      }

      const now = new Date();
      for (const item of items) {
        await prisma.courseRecommendation.upsert({
          where: {
            courseId_url: {
              courseId: course.id,
              url: item.url,
            },
          },
          create: {
            courseId: course.id,
            userId: job.userId,
            cacheKey,
            category: item.category,
            title: item.title.slice(0, 240),
            authors: item.authors?.slice(0, 240) ?? null,
            edition: item.edition?.slice(0, 80) ?? null,
            year: item.year ?? null,
            institutionOrBody: item.institutionOrBody?.slice(0, 180) ?? null,
            paperType: item.paperType?.slice(0, 60) ?? null,
            topicsJson: item.topics as unknown as Prisma.InputJsonValue,
            url: item.url.slice(0, 1200),
            sourceDomain: item.sourceDomain.slice(0, 255),
            accessType: item.accessType,
            reason: item.reason.slice(0, 600),
            status: 'active',
            score: item.score,
            lastCheckedAt: now,
          },
          update: {
            title: item.title.slice(0, 240),
            authors: item.authors?.slice(0, 240) ?? null,
            edition: item.edition?.slice(0, 80) ?? null,
            year: item.year ?? null,
            institutionOrBody: item.institutionOrBody?.slice(0, 180) ?? null,
            paperType: item.paperType?.slice(0, 60) ?? null,
            topicsJson: item.topics as unknown as Prisma.InputJsonValue,
            accessType: item.accessType,
            reason: item.reason.slice(0, 600),
            score: item.score,
            lastCheckedAt: now,
          },
        });
      }

      await prisma.recommendationJob.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          searchesRun,
          resultsCount: items.length,
          finishedAt: new Date(),
        },
      });

      // Notify student in-app when results are ready
      if (items.length > 0 && prisma.notification?.create) {
        const bookCount = items.filter((i) => i.category === 'book').length;
        const pqCount = items.filter((i) => i.category === 'past_question').length;
        await prisma.notification
          .create({
            data: {
              userId: job.userId,
              type: 'system',
              title: `Resources ready for ${course.name}`,
              body: `Found ${bookCount} book${bookCount === 1 ? '' : 's'} and ${pqCount} past-question source${pqCount === 1 ? '' : 's'} for ${course.name}.`,
              occurrenceKey: `course_rec:${job.id}`,
            },
          })
          .catch(() => undefined);
      }
    } catch (err) {
      const code =
        typeof (err as { code?: unknown })?.code === 'string'
          ? (err as { code: string }).code
          : 'PIPELINE_ERROR';
      const message = err instanceof Error ? err.message : 'Resource search failed';
      const updated = await prisma.recommendationJob.findUnique({ where: { id: job.id } });
      const attempts = updated?.attempts ?? job.attempts + 1;
      const shouldRetry =
        attempts < MAX_ATTEMPTS &&
        code !== 'FEATURE_DISABLED' &&
        code !== 'MONTHLY_CAP_REACHED' &&
        code !== 'SEARCH_UNAVAILABLE';

      await prisma.recommendationJob.update({
        where: { id: job.id },
        data: {
          status: shouldRetry ? 'queued' : 'failed',
          errorCode: code.slice(0, 80),
          errorMessage: message.slice(0, 500),
          finishedAt: shouldRetry ? null : new Date(),
        },
      });

      await recordUsageEvent(prisma, {
        userId: job.userId,
        feature: 'course_resource_search',
        model: searchProvider.name,
        tokensIn: 0,
        tokensOut: 0,
        durationMs: Date.now() - startMs,
        status: 'error',
        errorCode: code,
        route: `job:${job.trigger}`,
      });

      logger.warn({ err, jobId: job.id, code }, 'Recommendation job failed');
    }
  }

  return {
    async enqueue({ courseId, userId, trigger }) {
      return prisma.recommendationJob.create({
        data: {
          courseId,
          userId,
          trigger,
          status: 'queued',
        },
      });
    },

    async processNext() {
      const next = await prisma.recommendationJob.findFirst({
        where: { status: 'queued' },
        orderBy: { createdAt: 'asc' },
      });
      if (!next) return false;
      await processJobRecord(next);
      return true;
    },

    async processById(jobId: string) {
      const job = await prisma.recommendationJob.findUnique({ where: { id: jobId } });
      if (!job || job.status !== 'queued') return;
      await processJobRecord(job);
    },

    async recheckStaleLinks(limit = 20) {
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const stale = await prisma.courseRecommendation.findMany({
        where: {
          status: { in: ['active', 'saved'] },
          hidden: false,
          OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }],
        },
        take: limit,
        orderBy: { lastCheckedAt: 'asc' },
      });

      let checked = 0;
      for (const rec of stale) {
        const res = await verifyPublicHttpUrl(rec.url);
        await prisma.courseRecommendation.update({
          where: { id: rec.id },
          data: {
            status: res.ok ? rec.status : 'dead',
            lastCheckedAt: new Date(),
          },
        });
        checked += 1;
      }
      return checked;
    },

    startWorker(intervalMs = 2000) {
      if (timer) return;
      timer = setInterval(() => {
        if (polling) return;
        polling = true;
        this.processNext()
          .catch((err) => logger.error({ err }, 'Recommendation worker loop error'))
          .finally(() => {
            polling = false;
          });
      }, intervalMs);

      // Periodic dead-link recheck every 6 hours
      recheckTimer = setInterval(
        () => {
          this.recheckStaleLinks(20).catch((err) =>
            logger.warn({ err }, 'Periodic recommendation link recheck failed'),
          );
        },
        6 * 60 * 60 * 1000,
      );
    },

    stopWorker() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      if (recheckTimer) {
        clearInterval(recheckTimer);
        recheckTimer = null;
      }
    },
  };
}
