import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env';
import { createLogger } from './lib/logger';
import { createErrorHandler, notFound } from './middleware/errorHandler';
import {
  requireAuth,
  requireGuardianConsent,
  requireLearnerType,
  requireVerified,
} from './middleware/auth';
import { createRateLimiter, setRateLimitPrisma } from './middleware/rateLimit';
import { requestId } from './middleware/requestId';
import { healthRouter, type HealthDeps } from './modules/health/health.routes';
import type { PrismaClient } from '@prisma/client';
import { aiRouter } from './modules/ai/ai.routes';
import type { AiService } from './modules/ai/ai.service';
import type { TranscribeService } from './modules/ai/transcribe.service';
import { adminRouter, studentEngagementRouter } from './modules/admin/admin.routes';
import type { AdminService } from './modules/admin/admin.service';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { attachmentsRouter } from './modules/ai/attachments.routes';
import type { AttachmentsService } from './modules/ai/attachments.service';
import { documentsRouter } from './modules/documents/documents.routes';
import type { DocumentsService } from './modules/documents/documents.service';
import { authRouter } from './modules/auth/auth.routes';
import type { AuthService } from './modules/auth/auth.service';
import { coursesRouter } from './modules/courses/courses.routes';
import type { CoursesService } from './modules/courses/courses.service';
import type { RecommendationsService } from './modules/courses/recommendations.service';
import { communityRouter } from './modules/community/community.routes';
import type { createCommunityService } from './modules/community/community.service';
import type { createCommunityGroupsService } from './modules/community/community.groups.service';
import type { CommunityRealtimeHub } from './modules/community/community.realtime';
import { shsRouter } from './modules/shs/shs.routes';
import type { createShsService } from './modules/shs/shs.service';
import { dashboardRouter } from './modules/dashboard/dashboard.service';
import { examsRouter } from './modules/exams/exams.routes';
import type { ExamsService } from './modules/exams/exams.service';
import { focusRouter } from './modules/focus/focus.routes';
import type { FocusService } from './modules/focus/focus.service';
import { gpaRouter } from './modules/gpa/gpa.routes';
import type { GpaService } from './modules/gpa/gpa.service';
import { notesRouter } from './modules/notes/notes.routes';
import type { NotesService } from './modules/notes/notes.service';
import { plannerRouter } from './modules/planner/planner.routes';
import type { PlannerService } from './modules/planner/planner.service';
import { ragRouter } from './modules/rag/rag.routes';
import type { RagService } from './modules/rag/rag.service';
import { studyRouter } from './modules/study/study.routes';
import type { StudyService } from './modules/study/study.service';
import { timetableRouter } from './modules/timetable/timetable.routes';
import type { TimetableService } from './modules/timetable/timetable.service';
import { usersRouter } from './modules/users/users.routes';
import type { UsersService } from './modules/users/users.service';

export interface AppDeps extends HealthDeps {
  auth?: AuthService;
  users?: UsersService;
  courses?: CoursesService;
  recommendations?: RecommendationsService;
  community?: {
    core: ReturnType<typeof createCommunityService>;
    groups: ReturnType<typeof createCommunityGroupsService>;
    realtime: CommunityRealtimeHub;
    isEmailVerified: (userId: string) => Promise<boolean>;
  };
  shs?: {
    service: ReturnType<typeof createShsService>;
    isEmailVerified: (userId: string) => Promise<boolean>;
  };
  timetable?: TimetableService;
  exams?: { service: ExamsService; isEmailVerified: (userId: string) => Promise<boolean> };
  ai?: {
    service: AiService;
    transcribe?: TranscribeService;
    isEmailVerified: (userId: string) => Promise<boolean>;
  };
  notes?: { service: NotesService; isEmailVerified: (userId: string) => Promise<boolean> };
  planner?: PlannerService;
  focus?: FocusService;
  gpa?: GpaService;
  study?: { service: StudyService; isEmailVerified: (userId: string) => Promise<boolean> };
  rag?: { service: RagService; isEmailVerified: (userId: string) => Promise<boolean> };
  attachments?: {
    service: AttachmentsService;
    isEmailVerified: (userId: string) => Promise<boolean>;
  };
  documents?: { service: DocumentsService; isEmailVerified: (userId: string) => Promise<boolean> };
  admin?: { service: AdminService; prisma: PrismaClient };
  dashboardPrisma?: PrismaClient;
  isEmailVerified?: (userId: string) => Promise<boolean>;
}

export const API_PREFIX = '/api/v1';

/**
 * Builds the Express app. Everything it needs is passed in (config + dependencies),
 * so tests can create isolated instances without a database or environment variables.
 */
export function createApp(env: Env, deps: AppDeps, logger: Logger = createLogger(env)): Express {
  const app = express();

  if (env.NODE_ENV !== 'test' && deps.dashboardPrisma) {
    setRateLimitPrisma(deps.dashboardPrisma);
  }

  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as { requestId: string }).requestId,
      autoLogging: { ignore: (req) => req.url?.includes('/health') ?? false },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
      },
    }),
  );

  // Public health routes (/api/health, /api/health/ready) registered before security headers,
  // CORS restrictions, rate limiters, body parsers, and auth middleware so infra probes always pass.
  app.use('/api', healthRouter(deps));

  app.use(
    helmet({
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: { maxAge: 31_536_000, includeSubDomains: true },
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
    next();
  });
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-step-up-password'],
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
      maxAge: 600,
    }),
  );

  const isHealthPath = (path: string) =>
    path.startsWith(`${API_PREFIX}/health`) || path.startsWith('/api/health');

  const readLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: env.RATE_LIMIT_GLOBAL_PER_MIN,
    skip: (req) => isHealthPath(req.path) || req.method !== 'GET',
  });

  const mutationLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: Math.min(env.RATE_LIMIT_GLOBAL_PER_MIN, 120),
    skip: (req) =>
      isHealthPath(req.path) ||
      req.method === 'GET' ||
      req.method === 'HEAD' ||
      req.method === 'OPTIONS',
  });

  app.use(readLimiter);
  app.use(mutationLimiter);

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use(API_PREFIX, healthRouter(deps));

  const verifyEmailCheck =
    deps.isEmailVerified ??
    deps.ai?.isEmailVerified ??
    deps.notes?.isEmailVerified ??
    deps.study?.isEmailVerified ??
    deps.rag?.isEmailVerified ??
    deps.attachments?.isEmailVerified ??
    deps.documents?.isEmailVerified ??
    (deps.dashboardPrisma
      ? async (userId: string) => {
          const row = await deps.dashboardPrisma!.user.findUnique({
            where: { id: userId },
            select: { emailVerified: true },
          });
          return Boolean(row?.emailVerified);
        }
      : undefined);

  const PUBLIC_OR_VERIFY_ALLOWED_AUTH_PATHS = new Set([
    '/auth/providers',
    '/auth/signup',
    '/auth/login',
    '/auth/verify-otp',
    '/auth/resend-otp',
    '/auth/refresh',
    '/auth/logout',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/google',
    '/auth/google/callback',
    '/auth/verify-email',
    '/auth/admin-2fa/verify',
    '/auth/admin-invite/accept',
    '/auth/me',
    '/auth/change-email',
  ]);

  if (verifyEmailCheck || deps.dashboardPrisma) {
    const authMiddleware = requireAuth(env.JWT_SECRET);
    const verifiedMiddleware = requireVerified(deps.dashboardPrisma ?? verifyEmailCheck!);
    const consentMiddleware = deps.dashboardPrisma
      ? requireGuardianConsent(deps.dashboardPrisma)
      : null;

    app.use(API_PREFIX, (req, res, next) => {
      if (
        req.path.startsWith('/health') ||
        PUBLIC_OR_VERIFY_ALLOWED_AUTH_PATHS.has(req.path) ||
        (req.method === 'GET' && /^\/users\/[^/]+\/avatar$/.test(req.path))
      ) {
        next();
        return;
      }
      if (!req.header('authorization')?.startsWith('Bearer ')) {
        next();
        return;
      }
      authMiddleware(req, res, (authErr?: unknown) => {
        if (authErr) {
          next(authErr);
          return;
        }
        verifiedMiddleware(req, res, (verifyErr?: unknown) => {
          if (verifyErr) {
            next(verifyErr);
            return;
          }
          if (!consentMiddleware || req.path.startsWith('/shs/consent')) {
            next();
            return;
          }
          consentMiddleware(req, res, next);
        });
      });
    });
  }

  if (deps.auth) {
    app.use(API_PREFIX, authRouter(deps.auth, env));
  }
  if (deps.users) {
    app.use(API_PREFIX, usersRouter(deps.users, env));
  }
  if (deps.courses) {
    app.use(API_PREFIX, coursesRouter(deps.courses, env, deps.recommendations));
  }
  if (deps.community) {
    app.use(
      API_PREFIX,
      communityRouter({
        core: deps.community.core,
        groups: deps.community.groups,
        realtime: deps.community.realtime,
        env,
        isEmailVerified: deps.community.isEmailVerified,
      }),
    );
  }
  if (deps.shs) {
    if (deps.dashboardPrisma) {
      const requireShs = requireLearnerType(deps.dashboardPrisma, 'shs');
      app.use(`${API_PREFIX}/shs/wassce`, requireAuth(env.JWT_SECRET), requireShs);
      app.use(`${API_PREFIX}/shs/dashboard`, requireAuth(env.JWT_SECRET), requireShs);
      app.use(`${API_PREFIX}/shs/wassce-date`, requireAuth(env.JWT_SECRET), requireShs);
      app.use(`${API_PREFIX}/shs/daily-challenge`, requireAuth(env.JWT_SECRET), requireShs);
    }
    app.use(
      API_PREFIX,
      shsRouter({
        shs: deps.shs.service,
        env,
        isEmailVerified: deps.shs.isEmailVerified,
      }),
    );
  }
  if (deps.timetable) {
    app.use(API_PREFIX, timetableRouter(deps.timetable, env));
  }
  if (deps.exams) {
    app.use(
      API_PREFIX,
      examsRouter({
        exams: deps.exams.service,
        env,
        isEmailVerified: deps.exams.isEmailVerified,
      }),
    );
  }
  if (deps.ai) {
    app.use(
      API_PREFIX,
      aiRouter({
        ai: deps.ai.service,
        transcribe: deps.ai.transcribe,
        env,
        isEmailVerified: deps.ai.isEmailVerified,
      }),
    );
  }
  if (deps.notes) {
    app.use(
      API_PREFIX,
      notesRouter({
        notes: deps.notes.service,
        env,
        isEmailVerified: deps.notes.isEmailVerified,
      }),
    );
  }
  if (deps.planner) {
    app.use(API_PREFIX, plannerRouter(deps.planner, env));
  }
  if (deps.focus) {
    app.use(API_PREFIX, focusRouter(deps.focus, env));
  }
  if (deps.gpa) {
    if (deps.dashboardPrisma) {
      app.use(
        `${API_PREFIX}/gpa`,
        requireAuth(env.JWT_SECRET),
        requireLearnerType(deps.dashboardPrisma, 'university'),
      );
    }
    app.use(API_PREFIX, gpaRouter(deps.gpa, env));
  }
  if (deps.study) {
    app.use(
      API_PREFIX,
      studyRouter({
        study: deps.study.service,
        env,
        isEmailVerified: deps.study.isEmailVerified,
      }),
    );
  }
  if (deps.rag) {
    app.use(
      API_PREFIX,
      ragRouter({
        rag: deps.rag.service,
        env,
        isEmailVerified: deps.rag.isEmailVerified,
      }),
    );
  }
  if (deps.attachments) {
    app.use(
      API_PREFIX,
      attachmentsRouter({
        attachments: deps.attachments.service,
        env,
        isEmailVerified: deps.attachments.isEmailVerified,
      }),
    );
  }
  if (deps.documents) {
    app.use(
      API_PREFIX,
      documentsRouter({
        documents: deps.documents.service,
        env,
        isEmailVerified: deps.documents.isEmailVerified,
      }),
    );
  }
  if (deps.dashboardPrisma) {
    app.use(API_PREFIX, dashboardRouter(deps.dashboardPrisma, env));
    app.use(API_PREFIX, analyticsRouter(deps.dashboardPrisma, env));
  }
  if (deps.admin) {
    app.use(API_PREFIX, studentEngagementRouter(deps.admin.service, env));
    app.use(
      '/api/admin',
      adminRouter({ admin: deps.admin.service, prisma: deps.admin.prisma, env }),
    );
  }

  app.use(notFound);
  app.use(createErrorHandler(deps.dashboardPrisma, env.SENTRY_DSN));

  return app;
}
