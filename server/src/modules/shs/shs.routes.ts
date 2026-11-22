import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { asyncHandler, validateBody } from '../../middleware/validate';
import type { createShsService } from './shs.service';

const selectSubjectsSchema = z
  .object({
    schoolYear: z.enum(['SHS 1', 'SHS 2', 'SHS 3']).optional(),
    schoolName: z.string().trim().max(120).nullable().optional(),
    programme: z.string().trim().max(120).nullable().optional(),
    subjectIds: z.array(z.string().uuid()).max(20).default([]),
    customNames: z.array(z.string().trim().min(1).max(60)).max(15).default([]),
  })
  .strict();

const requestConsentSchema = z
  .object({
    guardianEmail: z.string().trim().email('Enter a valid guardian email address').max(255),
    guardianPhone: z.string().trim().max(30).nullable().optional(),
  })
  .strict();

const consentTokenSchema = z
  .object({
    token: z.string().trim().min(10).max(256),
  })
  .strict();

const generateWassceMockSchema = z
  .object({
    courseId: z.string().uuid(),
    format: z.enum(['objective', 'theory', 'mixed']).default('objective'),
    topics: z.array(z.string().trim().min(1).max(160)).max(15).default([]),
    questionCount: z.number().int().min(3).max(15).default(5),
  })
  .strict();

const submitWassceMockSchema = z
  .object({
    answers: z.record(z.string(), z.union([z.number().int(), z.string().max(10000)])),
    durationSeconds: z.number().int().min(0).max(18000).default(0),
  })
  .strict();

export function shsRouter(deps: {
  shs: ReturnType<typeof createShsService>;
  env: Env;
  isEmailVerified: (userId: string) => Promise<boolean>;
}): Router {
  const { shs, env, isEmailVerified } = deps;
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);
  const verified = requireVerifiedEmail(isEmailVerified);

  router.get(
    '/shs/catalogue',
    auth,
    verified,
    asyncHandler(async (_req, res) => {
      res.json(await shs.getCatalogue());
    }),
  );

  router.post(
    '/shs/onboarding/subjects',
    auth,
    verified,
    validateBody(selectSubjectsSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await shs.selectOnboardingSubjects(req.user!.id, req.body));
    }),
  );

  router.get(
    '/shs/consent/status',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      res.json(await shs.getConsentStatus(req.user!.id));
    }),
  );

  router.post(
    '/shs/consent/request',
    auth,
    verified,
    validateBody(requestConsentSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await shs.requestGuardianConsent(req.user!.id, req.body));
    }),
  );

  router.post(
    '/shs/consent/approve',
    validateBody(consentTokenSchema),
    asyncHandler(async (req, res) => {
      res.json(
        await shs.approveGuardianConsent(req.body.token, {
          ip: req.ip,
          userAgent: req.header('user-agent'),
        }),
      );
    }),
  );

  router.post(
    '/shs/consent/withdraw',
    validateBody(consentTokenSchema),
    asyncHandler(async (req, res) => {
      res.json(await shs.withdrawGuardianConsent(req.body.token));
    }),
  );

  router.get(
    '/shs/wassce/attempts',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      res.json(await shs.listWassceAttempts(req.user!.id));
    }),
  );

  router.post(
    '/shs/wassce/mock',
    auth,
    verified,
    validateBody(generateWassceMockSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await shs.generateWassceMock(req.user!.id, req.body));
    }),
  );

  router.post(
    '/shs/wassce/mock/:id/submit',
    auth,
    verified,
    validateBody(submitWassceMockSchema),
    asyncHandler(async (req, res) => {
      res.json(await shs.submitWassceMock(req.user!.id, req.params.id ?? '', req.body));
    }),
  );

  router.get(
    '/shs/dashboard',
    auth,
    verified,
    asyncHandler(async (req, res) => {
      res.json(await shs.getShsDashboard(req.user!.id));
    }),
  );

  router.post(
    '/shs/wassce-date',
    auth,
    verified,
    validateBody(
      z
        .object({
          targetDate: z.string().trim().min(4).max(40),
          title: z.string().trim().max(120).optional(),
        })
        .strict(),
    ),
    asyncHandler(async (req, res) => {
      res.json(await shs.setWassceTargetDate(req.user!.id, req.body.targetDate, req.body.title));
    }),
  );

  router.post(
    '/shs/daily-challenge/answer',
    auth,
    verified,
    validateBody(
      z
        .object({
          challengeId: z.string().trim().min(2).max(60),
          selectedIndex: z.number().int().min(0).max(5),
        })
        .strict(),
    ),
    asyncHandler(async (req, res) => {
      res.json(
        await shs.answerDailyChallenge(req.user!.id, req.body.challengeId, req.body.selectedIndex),
      );
    }),
  );

  return router;
}
