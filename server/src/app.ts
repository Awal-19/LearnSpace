import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env';
import { createLogger } from './lib/logger';
import { errorHandler, notFound } from './middleware/errorHandler';
import { createRateLimiter } from './middleware/rateLimit';
import { requestId } from './middleware/requestId';
import { healthRouter, type HealthDeps } from './modules/health/health.routes';
import type { PrismaClient } from '@prisma/client';
import { aiRouter } from './modules/ai/ai.routes';
import type { AiService } from './modules/ai/ai.service';
import { attachmentsRouter } from './modules/ai/attachments.routes';
import type { AttachmentsService } from './modules/ai/attachments.service';
import { documentsRouter } from './modules/documents/documents.routes';
import type { DocumentsService } from './modules/documents/documents.service';
import { authRouter } from './modules/auth/auth.routes';
import type { AuthService } from './modules/auth/auth.service';
import { dashboardRouter } from './modules/dashboard/dashboard.service';
import { focusRouter } from './modules/focus/focus.routes';
import type { FocusService } from './modules/focus/focus.service';
import { notesRouter } from './modules/notes/notes.routes';
import type { NotesService } from './modules/notes/notes.service';
import { plannerRouter } from './modules/planner/planner.routes';
import type { PlannerService } from './modules/planner/planner.service';
import { ragRouter } from './modules/rag/rag.routes';
import type { RagService } from './modules/rag/rag.service';
import { studyRouter } from './modules/study/study.routes';
import type { StudyService } from './modules/study/study.service';
import { usersRouter } from './modules/users/users.routes';
import type { UsersService } from './modules/users/users.service';

export interface AppDeps extends HealthDeps {
  auth?: AuthService;
  users?: UsersService;
  ai?: { service: AiService; isEmailVerified: (userId: string) => Promise<boolean> };
  notes?: { service: NotesService; isEmailVerified: (userId: string) => Promise<boolean> };
  planner?: PlannerService;
  focus?: FocusService;
  study?: { service: StudyService; isEmailVerified: (userId: string) => Promise<boolean> };
  rag?: { service: RagService; isEmailVerified: (userId: string) => Promise<boolean> };
  attachments?: { service: AttachmentsService; isEmailVerified: (userId: string) => Promise<boolean> };
  documents?: { service: DocumentsService; isEmailVerified: (userId: string) => Promise<boolean> };
  dashboardPrisma?: PrismaClient;
}

export const API_PREFIX = '/api/v1';

/**
 * Builds the Express app. Everything it needs is passed in (config + dependencies),
 * so tests can create isolated instances without a database or environment variables.
 */
export function createApp(env: Env, deps: AppDeps, logger: Logger = createLogger(env)): Express {
  const app = express();

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

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['X-Request-Id', 'Retry-After'],
      maxAge: 600,
    }),
  );

  app.use(
    createRateLimiter({
      windowMs: 60_000,
      limit: env.RATE_LIMIT_GLOBAL_PER_MIN,
      skip: (req) => req.path.startsWith(`${API_PREFIX}/health`),
    }),
  );

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.use('/api', healthRouter(deps));
  app.use(API_PREFIX, healthRouter(deps));
  if (deps.auth) {
    app.use(API_PREFIX, authRouter(deps.auth, env));
  }
  if (deps.users) {
    app.use(API_PREFIX, usersRouter(deps.users, env));
  }
  if (deps.ai) {
    app.use(
      API_PREFIX,
      aiRouter({ ai: deps.ai.service, env, isEmailVerified: deps.ai.isEmailVerified }),
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
  }

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

