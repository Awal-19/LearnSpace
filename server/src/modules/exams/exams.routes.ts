import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rateLimit';
import { asyncHandler, validateBody, validateQuery } from '../../middleware/validate';
import {
  createExamSchema,
  generateRevisionPlanSchema,
  listExamsQuerySchema,
  saveRevisionPlanSchema,
  updateExamSchema,
  updateRevisionSessionSchema,
} from './exams.schemas';
import type { ExamsService } from './exams.service';

const uuidSchema = z.string().uuid();

function parseUuid(raw: string | undefined, label: string): string {
  const parsed = uuidSchema.safeParse(raw ?? '');
  if (!parsed.success) throw new AppError('NOT_FOUND', `${label} not found`);
  return parsed.data;
}

export interface ExamsRouterDeps {
  exams: ExamsService;
  env: Env;
  isEmailVerified: (userId: string) => Promise<boolean>;
}

export function examsRouter({ exams, env, isEmailVerified }: ExamsRouterDeps): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);
  const verified = requireVerifiedEmail(isEmailVerified);

  const generateLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: 10,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    skip: () => env.NODE_ENV === 'test',
  });

  // Exams
  router.get(
    '/exams',
    auth,
    validateQuery(listExamsQuerySchema),
    asyncHandler(async (req, res) => {
      res.json(
        await exams.listExams(
          req.user!.id,
          req.query as unknown as z.infer<typeof listExamsQuerySchema>,
        ),
      );
    }),
  );

  router.post(
    '/exams',
    auth,
    validateBody(createExamSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await exams.createExam(req.user!.id, req.body));
    }),
  );

  router.patch(
    '/exams/:id',
    auth,
    validateBody(updateExamSchema),
    asyncHandler(async (req, res) => {
      res.json(await exams.updateExam(req.user!.id, parseUuid(req.params.id, 'Exam'), req.body));
    }),
  );

  router.delete(
    '/exams/:id',
    auth,
    asyncHandler(async (req, res) => {
      await exams.deleteExam(req.user!.id, parseUuid(req.params.id, 'Exam'));
      res.status(204).end();
    }),
  );

  // Revision plans
  router.get(
    '/revision-plans',
    auth,
    asyncHandler(async (req, res) => {
      res.json(await exams.listRevisionPlans(req.user!.id));
    }),
  );

  router.post(
    '/revision-plans/generate',
    auth,
    verified,
    generateLimiter,
    validateBody(generateRevisionPlanSchema),
    asyncHandler(async (req, res) => {
      res.json(await exams.generateRevisionPlan(req.user!.id, req.body));
    }),
  );

  router.post(
    '/revision-plans',
    auth,
    validateBody(saveRevisionPlanSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await exams.saveRevisionPlan(req.user!.id, req.body));
    }),
  );

  router.patch(
    '/revision-plans/:planId/sessions/:sessionId',
    auth,
    validateBody(updateRevisionSessionSchema),
    asyncHandler(async (req, res) => {
      res.json(
        await exams.updateRevisionSession(
          req.user!.id,
          parseUuid(req.params.planId, 'Revision plan'),
          parseUuid(req.params.sessionId, 'Revision session'),
          req.body,
        ),
      );
    }),
  );

  router.post(
    '/revision-plans/:planId/reschedule-missed',
    auth,
    asyncHandler(async (req, res) => {
      res.json(
        await exams.rescheduleMissedSessions(
          req.user!.id,
          parseUuid(req.params.planId, 'Revision plan'),
        ),
      );
    }),
  );

  router.delete(
    '/revision-plans/:planId',
    auth,
    asyncHandler(async (req, res) => {
      await exams.deleteRevisionPlan(req.user!.id, parseUuid(req.params.planId, 'Revision plan'));
      res.status(204).end();
    }),
  );

  return router;
}
