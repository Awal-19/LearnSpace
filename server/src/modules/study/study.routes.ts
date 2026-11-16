import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rateLimit';
import { asyncHandler, validateBody, validateQuery } from '../../middleware/validate';
import {
  createCardSchema,
  createDeckSchema,
  generateDeckSchema,
  generateQuizSchema,
  paginationQuerySchema,
  quizAttemptsRangeSchema,
  submitAttemptSchema,
  updateCardSchema,
  updateDeckSchema,
} from './study.schemas';
import type { StudyService } from './study.service';

const uuidSchema = z.string().uuid();
function parseUuid(raw: string | undefined, label: string): string {
  const parsed = uuidSchema.safeParse(raw ?? '');
  if (!parsed.success) throw new AppError('NOT_FOUND', `${label} not found`);
  return parsed.data;
}

export interface StudyRouterDeps {
  study: StudyService;
  env: Env;
  isEmailVerified: (userId: string) => Promise<boolean>;
}

export function studyRouter({ study, env, isEmailVerified }: StudyRouterDeps): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);
  const verified = requireVerifiedEmail(isEmailVerified);

  const generateLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: 10,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    skip: () => env.NODE_ENV === 'test',
  });

  // Decks & cards
  router.get(
    '/decks',
    auth,
    validateQuery(paginationQuerySchema),
    asyncHandler(async (req, res) => {
      res.json(
        await study.listDecks(
          req.user!.id,
          req.query as unknown as z.infer<typeof paginationQuerySchema>,
        ),
      );
    }),
  );

  router.post(
    '/decks',
    auth,
    validateBody(createDeckSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await study.createDeck(req.user!.id, req.body));
    }),
  );

  router.post(
    '/decks/generate',
    auth,
    verified,
    generateLimiter,
    validateBody(generateDeckSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await study.generateDeck(req.user!.id, req.body));
    }),
  );

  router.get(
    '/decks/:id',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Deck');
      res.json(await study.getDeck(req.user!.id, id));
    }),
  );

  router.patch(
    '/decks/:id',
    auth,
    validateBody(updateDeckSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Deck');
      res.json(await study.updateDeck(req.user!.id, id, req.body));
    }),
  );

  router.delete(
    '/decks/:id',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Deck');
      await study.deleteDeck(req.user!.id, id);
      res.status(204).end();
    }),
  );

  router.post(
    '/decks/:id/cards',
    auth,
    validateBody(createCardSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Deck');
      res.status(201).json(await study.createCard(req.user!.id, id, req.body));
    }),
  );

  router.patch(
    '/cards/:id',
    auth,
    validateBody(updateCardSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Card');
      res.json(await study.updateCard(req.user!.id, id, req.body));
    }),
  );

  router.delete(
    '/cards/:id',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Card');
      await study.deleteCard(req.user!.id, id);
      res.status(204).end();
    }),
  );

  // Quizzes & attempts
  router.get(
    '/quizzes',
    auth,
    asyncHandler(async (req, res) => {
      res.json(await study.listQuizzes(req.user!.id));
    }),
  );

  router.post(
    '/quizzes/generate',
    auth,
    verified,
    generateLimiter,
    validateBody(generateQuizSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await study.generateQuiz(req.user!.id, req.body));
    }),
  );

  router.get(
    '/quizzes/:id',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Quiz');
      res.json(await study.getQuiz(req.user!.id, id));
    }),
  );

  router.delete(
    '/quizzes/:id',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Quiz');
      await study.deleteQuiz(req.user!.id, id);
      res.status(204).end();
    }),
  );

  router.post(
    '/quizzes/:id/attempts',
    auth,
    validateBody(submitAttemptSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Quiz');
      res.status(201).json(await study.submitAttempt(req.user!.id, id, req.body));
    }),
  );

  router.get(
    '/quizzes/:id/attempts',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Quiz');
      res.json(await study.listQuizAttempts(req.user!.id, id));
    }),
  );

  router.get(
    '/quiz-attempts',
    auth,
    validateQuery(quizAttemptsRangeSchema),
    asyncHandler(async (req, res) => {
      res.json(
        await study.listAllAttempts(
          req.user!.id,
          req.query as unknown as z.infer<typeof quizAttemptsRangeSchema>,
        ),
      );
    }),
  );

  return router;
}

