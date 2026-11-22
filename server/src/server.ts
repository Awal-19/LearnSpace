import 'dotenv/config';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Logger } from 'pino';
import { createApp } from './app';
import {
  EnvError,
  loadEnv,
  RECOMMENDED_PROD_ENV_VARS,
  REQUIRED_ENV_VARS,
  type Env,
} from './config/env';
import { createEmailService } from './lib/email';
import { createGeminiProvider } from './lib/llm/gemini';
import { createNvidiaProvider } from './lib/llm/nvidia';
import { createLogger } from './lib/logger';
import { hashPassword } from './lib/password';
import { createPrismaClient } from './lib/prisma';
import { createStorageService } from './lib/storage';
import { createWebSearchProvider } from './lib/webSearch';
import { createAiService } from './modules/ai/ai.service';
import { createTranscribeService } from './modules/ai/transcribe.service';
import { createAttachmentsService } from './modules/ai/attachments.service';
import { createAdminService } from './modules/admin/admin.service';
import { createDocumentJobQueue } from './modules/documents/documents.jobs';
import { createDocumentsService } from './modules/documents/documents.service';
import { createAuthService } from './modules/auth/auth.service';
import { createCoursesService } from './modules/courses/courses.service';
import { createRecommendationJobQueue } from './modules/courses/recommendations.jobs';
import { createRecommendationsService } from './modules/courses/recommendations.service';
import { createCommunityRealtimeHub } from './modules/community/community.realtime';
import { createCommunityService } from './modules/community/community.service';
import { createCommunityGroupsService } from './modules/community/community.groups.service';
import { createShsService } from './modules/shs/shs.service';
import { createExamsService } from './modules/exams/exams.service';
import { createFocusService } from './modules/focus/focus.service';
import { createGpaService } from './modules/gpa/gpa.service';
import { createNotesService } from './modules/notes/notes.service';
import { createPlannerService } from './modules/planner/planner.service';
import { createRagService } from './modules/rag/rag.service';
import { createStudyService } from './modules/study/study.service';
import { createTimetableService } from './modules/timetable/timetable.service';
import { createUsersService } from './modules/users/users.service';

const execFileAsync = promisify(execFile);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runStartupMigrations(databaseUrl: string, logger: Logger): Promise<boolean> {
  let prismaCliPath: string;
  try {
    prismaCliPath = path.join(
      path.dirname(require.resolve('prisma/package.json')),
      'build',
      'index.js',
    );
  } catch (err) {
    logger.error({ err }, 'Could not resolve Prisma CLI binary for startup migrations');
    return false;
  }

  const serverRoot = path.resolve(__dirname, '..');
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await execFileAsync(process.execPath, [prismaCliPath, 'migrate', 'deploy'], {
        cwd: serverRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl },
        timeout: 30_000,
      });
      logger.info({ attempt }, 'Database migrations verified');
      return true;
    } catch (err) {
      logger.warn(
        { err, attempt, maxAttempts },
        'Startup prisma migrate deploy attempt failed; retrying if attempts remain',
      );
      if (attempt < maxAttempts) {
        await sleep(2_000);
      }
    }
  }

  logger.error('Startup prisma migrate deploy failed; readiness probe will stay 503');
  return false;
}

async function ensureBootstrapAdmin(
  prisma: ReturnType<typeof createPrismaClient>,
  adminEmailRaw: string | undefined,
  adminConsolePassword: string | undefined,
  logger: Logger,
): Promise<void> {
  const adminEmail = adminEmailRaw?.trim().toLowerCase();
  if (!adminEmail) return;

  try {
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existing) {
      if (existing.role === 'student' && !existing.emailVerified) {
        logger.warn(
          { adminEmail },
          'Refusing to auto-promote unverified student account matching ADMIN_EMAIL',
        );
        return;
      }
      const needsRoleUpdate =
        existing.role !== 'super_admin' || existing.status !== 'active' || !existing.emailVerified;
      const needsPasswordBootstrap = Boolean(adminConsolePassword && !existing.passwordHash);
      if (needsRoleUpdate || needsPasswordBootstrap) {
        const passwordHash = needsPasswordBootstrap
          ? await hashPassword(adminConsolePassword!)
          : undefined;
        await prisma.user.update({
          where: { id: existing.id },
          data: {
            role: 'super_admin',
            status: 'active',
            emailVerified: true,
            ...(passwordHash ? { passwordHash } : {}),
          },
        });
        logger.info({ adminEmail }, 'Promoted ADMIN_EMAIL user to super_admin');
      }
    } else {
      const name = adminEmail.split('@')[0]?.slice(0, 100) || 'Admin';
      const passwordHash = adminConsolePassword ? await hashPassword(adminConsolePassword) : null;
      await prisma.user.create({
        data: {
          email: adminEmail,
          name,
          role: 'super_admin',
          status: 'active',
          emailVerified: true,
          passwordHash,
          settings: { create: { timezone: 'UTC' } },
        },
      });
      logger.info({ adminEmail }, 'Bootstrapped super_admin account for ADMIN_EMAIL');
    }

    await prisma.appSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global' },
      update: {},
    });
  } catch (err) {
    logger.warn({ err, adminEmail }, 'Startup admin bootstrap failed');
  }
}

function main(): void {
  let env: Env;
  try {
    env = loadEnv();
  } catch (err) {
    console.error(err instanceof EnvError ? err.message : err);
    console.error(`Required environment variables: ${REQUIRED_ENV_VARS.join(', ')}`);
    console.error(
      `Recommended production environment variables: ${RECOMMENDED_PROD_ENV_VARS.join(', ')}`,
    );
    console.error(
      'Set these in server/.env locally or in Railway Service -> Variables before starting.',
    );
    process.exit(1);
  }

  // Keep process.env.DATABASE_URL synchronized with normalized SSL parameters for Prisma CLI & runtime.
  process.env.DATABASE_URL = env.DATABASE_URL;

  const logger = createLogger(env);
  const prisma = createPrismaClient(env.DATABASE_URL);
  const email = createEmailService(env, logger, prisma);
  const storage = createStorageService(env, logger, prisma);
  if (env.CLOUDINARY_URL) {
    logger.info('Storage initialized with Cloudinary');
  } else if (storage.isConfigured()) {
    logger.info(
      'CLOUDINARY_URL is not set; using PostgreSQL StoredBlob fallback for documents and attachments',
    );
  } else {
    logger.error(
      'Document storage is NOT configured: set CLOUDINARY_URL (cloudinary://API_KEY:API_SECRET@CLOUD_NAME) or enable database fallback',
    );
  }
  const llm = env.NVIDIA_API_KEY
    ? createNvidiaProvider(env, logger)
    : createGeminiProvider(env, logger);
  const isEmailVerified = async (userId: string) => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });
    return Boolean(user?.emailVerified);
  };

  const aiDailyTokenLimit = env.AI_DAILY_TOKEN_LIMIT ?? null;
  const auth = createAuthService({ prisma, env, email, logger });
  const users = createUsersService({ prisma, storage, logger });
  const searchProvider = createWebSearchProvider(env);
  const recommendationQueue = createRecommendationJobQueue({
    prisma,
    searchProvider,
    llm,
    logger,
  });
  const recommendations = createRecommendationsService({
    prisma,
    queue: recommendationQueue,
    logger,
  });
  const courses = createCoursesService({ prisma, storage, recommendationQueue, logger });
  const communityRealtime = createCommunityRealtimeHub();
  const communityCore = createCommunityService({
    prisma,
    llm,
    dailyTokenLimit: aiDailyTokenLimit,
    logger,
  });
  const communityGroups = createCommunityGroupsService({
    prisma,
    core: communityCore,
    realtime: communityRealtime,
    storage,
    llm,
    dailyTokenLimit: aiDailyTokenLimit,
    logger,
  });
  const shs = createShsService({ prisma, logger, email, clientUrl: env.CLIENT_URL, llm });
  const rag = createRagService({ prisma, logger });
  const attachments = createAttachmentsService({ prisma, storage, logger });
  const documentJobs = createDocumentJobQueue({ prisma, storage, llm, logger });
  const documents = createDocumentsService({
    prisma,
    storage,
    jobs: documentJobs,
    llm,
    dailyTokenLimit: aiDailyTokenLimit,
    logger,
  });
  const admin = createAdminService({ prisma, env, email, storage, llm, logger });
  const ai = createAiService({
    prisma,
    llm,
    logger,
    rag,
    attachments,
    storage,
    dailyTokenLimit: aiDailyTokenLimit,
  });
  const transcribe = createTranscribeService({ prisma, env, logger });
  const notes = createNotesService({ prisma, llm, logger });
  const planner = createPlannerService({ prisma, email, logger, clientUrl: env.CLIENT_URL });
  const timetable = createTimetableService({ prisma, email, logger, clientUrl: env.CLIENT_URL });
  const exams = createExamsService({
    prisma,
    llm,
    email,
    logger,
    clientUrl: env.CLIENT_URL,
    dailyTokenLimit: aiDailyTokenLimit,
  });
  const focus = createFocusService(prisma);
  const gpa = createGpaService({ prisma, logger });
  const study = createStudyService({
    prisma,
    llm,
    logger,
    storage,
    dailyTokenLimit: aiDailyTokenLimit,
  });

  const shouldRunStartupMigrations =
    (env.NODE_ENV === 'production' || process.env.RUN_STARTUP_MIGRATIONS === 'true') &&
    process.env.SKIP_STARTUP_MIGRATIONS !== 'true';
  let migrationsReady = !shouldRunStartupMigrations;

  const app = createApp(
    env,
    {
      checkDb: async () => {
        if (!migrationsReady) {
          throw new Error('Startup database migrations still in progress');
        }
        await prisma.$queryRaw`SELECT 1`;
      },
      checkStorage: () => storage.isConfigured(),
      auth,
      users,
      courses,
      recommendations,
      community: {
        core: communityCore,
        groups: communityGroups,
        realtime: communityRealtime,
        isEmailVerified,
      },
      shs: {
        service: shs,
        isEmailVerified,
      },
      timetable,
      exams: { service: exams, isEmailVerified },
      ai: { service: ai, transcribe, isEmailVerified },
      notes: { service: notes, isEmailVerified },
      planner,
      focus,
      gpa,
      study: { service: study, isEmailVerified },
      rag: { service: rag, isEmailVerified },
      attachments: { service: attachments, isEmailVerified },
      documents: { service: documents, isEmailVerified },
      admin: { service: admin, prisma },
      dashboardPrisma: prisma,
    },
    logger,
  );

  let reminderTimer: NodeJS.Timeout | null = null;
  let shuttingDown = false;

  const startBackgroundJobs = () => {
    if (shuttingDown || reminderTimer) return;
    reminderTimer = setInterval(() => {
      void Promise.all([
        planner.processDueReminders().catch((err) => {
          logger.warn({ err }, 'Task reminder sweep failed');
        }),
        timetable.processDueClassReminders().catch((err) => {
          logger.warn({ err }, 'Class reminder sweep failed');
        }),
        exams.processDueExamReminders().catch((err) => {
          logger.warn({ err }, 'Exam reminder sweep failed');
        }),
      ]);
    }, 60_000);
    reminderTimer.unref();
    documentJobs.startWorker(2_000);
    recommendationQueue.startWorker(2_000);
  };

  // Bind 0.0.0.0:$PORT immediately so /api/health passes Railway probes without waiting on migrations.
  const server = app.listen(env.PORT, '0.0.0.0', () => {
    logger.info({ port: env.PORT, host: '0.0.0.0', env: env.NODE_ENV }, 'LearnSpace API listening');
  });
  // Stay above typical proxy idle timeouts (avoids sporadic 502s behind Railway/Render/NGINX).
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  if (shouldRunStartupMigrations) {
    void runStartupMigrations(env.DATABASE_URL, logger).then((ok) => {
      if (ok && !shuttingDown) {
        migrationsReady = true;
        startBackgroundJobs();
        void ensureBootstrapAdmin(prisma, env.ADMIN_EMAIL, env.ADMIN_CONSOLE_PASSWORD, logger);
      }
    });
  } else {
    startBackgroundJobs();
  }

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (reminderTimer) clearInterval(reminderTimer);
    documentJobs.stopWorker();
    recommendationQueue.stopWorker();
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) =>
    logger.error({ err: reason }, 'Unhandled rejection'),
  );
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });
}

main();
