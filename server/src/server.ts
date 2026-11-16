import 'dotenv/config';
import { createApp } from './app';
import { EnvError, loadEnv, type Env } from './config/env';
import { createEmailService } from './lib/email';
import { createGeminiProvider } from './lib/llm/gemini';
import { createNvidiaProvider } from './lib/llm/nvidia';
import { createLogger } from './lib/logger';
import { prisma } from './lib/prisma';
import { createStorageService } from './lib/storage';
import { createAiService } from './modules/ai/ai.service';
import { createAttachmentsService } from './modules/ai/attachments.service';
import { createDocumentJobQueue } from './modules/documents/documents.jobs';
import { createDocumentsService } from './modules/documents/documents.service';
import { createAuthService } from './modules/auth/auth.service';
import { createFocusService } from './modules/focus/focus.service';
import { createNotesService } from './modules/notes/notes.service';
import { createPlannerService } from './modules/planner/planner.service';
import { createRagService } from './modules/rag/rag.service';
import { createStudyService } from './modules/study/study.service';
import { createUsersService } from './modules/users/users.service';

function main(): void {
  let env: Env;
  try {
    env = loadEnv();
  } catch (err) {
    console.error(err instanceof EnvError ? err.message : err);
    console.error('Copy server/.env.example to server/.env and fill in the values.');
    process.exit(1);
  }

  const logger = createLogger(env);
  const email = createEmailService(env, logger);
  const storage = createStorageService(env, logger);
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

  const auth = createAuthService({ prisma, env, email, logger });
  const users = createUsersService({ prisma, storage, logger });
  const rag = createRagService({ prisma, logger });
  const attachments = createAttachmentsService({ prisma, storage, logger });
  const documentJobs = createDocumentJobQueue({ prisma, storage, llm, logger });
  const documents = createDocumentsService({ prisma, storage, jobs: documentJobs, llm, logger });
  const ai = createAiService({ prisma, llm, logger, rag, attachments, storage });
  const notes = createNotesService({ prisma, llm, logger });
  const planner = createPlannerService({ prisma, email, logger, clientUrl: env.CLIENT_URL });
  const focus = createFocusService(prisma);
  const study = createStudyService({ prisma, llm, logger });

  const app = createApp(
    env,
    {
      checkDb: async () => {
        await prisma.$queryRaw`SELECT 1`;
      },
      auth,
      users,
      ai: { service: ai, isEmailVerified },
      notes: { service: notes, isEmailVerified },
      planner,
      focus,
      study: { service: study, isEmailVerified },
      rag: { service: rag, isEmailVerified },
      attachments: { service: attachments, isEmailVerified },
      documents: { service: documents, isEmailVerified },
      dashboardPrisma: prisma,
    },
    logger,
  );

  const reminderTimer = setInterval(() => {
    void planner.processDueReminders().catch((err) => {
      logger.warn({ err }, 'Reminder sweep failed');
    });
  }, 60_000);
  reminderTimer.unref();
  documentJobs.startWorker(2_000);

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'LearnSpace API listening');
  });
  // Stay above typical proxy idle timeouts (avoids sporadic 502s behind Render/NGINX).
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(reminderTimer);
    documentJobs.stopWorker();
    logger.info({ signal }, 'Shutting down');
    server.close(() => {
      void prisma.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled rejection'));
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'Uncaught exception');
    process.exit(1);
  });
}

main();

