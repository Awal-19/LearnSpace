import { Router, type RequestHandler } from 'express';
import multer from 'multer';
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
  importCsvSchema,
  listQuizzesQuerySchema,
  paginationQuerySchema,
  quizAttemptsRangeSchema,
  reviewCardSchema,
  submitAttemptSchema,
  updateCardSchema,
  updateDeckSchema,
  updateQuizSchema,
} from './study.schemas';
import { MAX_CARD_IMAGE_BYTES, type StudyService } from './study.service';

const cardImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CARD_IMAGE_BYTES, files: 1 },
});

const handleCardImageMulter: RequestHandler = (req, res, next) => {
  cardImageUpload.single('file')(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      next(new AppError('PAYLOAD_TOO_LARGE', 'Card image must be 5 MB or smaller'));
      return;
    }
    next(new AppError('VALIDATION_ERROR', 'Invalid image upload'));
  });
};

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

  // IMPORTANT: Mounted before /decks/:id so "due-summary" is not treated as a deck UUID.
  router.get(
    '/decks/due-summary',
    auth,
    asyncHandler(async (req, res) => {
      res.json(await study.getDueSummary(req.user!.id));
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

  router.get(
    '/decks/:id/due',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Deck');
      res.json(await study.getDueCards(req.user!.id, id));
    }),
  );

  router.post(
    '/decks/:id/import-csv',
    auth,
    validateBody(importCsvSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Deck');
      res.status(201).json(await study.importCardsCsv(req.user!.id, id, req.body));
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

  router.post(
    '/cards/:id/review',
    auth,
    validateBody(reviewCardSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Card');
      res.json(await study.reviewCard(req.user!.id, id, req.body));
    }),
  );

  router.post(
    '/cards/:id/image',
    auth,
    handleCardImageMulter,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Card');
      if (!req.file?.buffer) {
        throw new AppError('VALIDATION_ERROR', 'Attach an image under the "file" field');
      }
      res.status(201).json(await study.uploadCardImage(req.user!.id, id, req.file.buffer));
    }),
  );

  router.get(
    '/cards/:id/image',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Card');
      const bytes = await study.readCardImage(req.user!.id, id);
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.send(bytes);
    }),
  );

  router.delete(
    '/cards/:id/image',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Card');
      res.json(await study.deleteCardImage(req.user!.id, id));
    }),
  );

  // Quizzes & attempts
  router.get(
    '/quizzes',
    auth,
    validateQuery(listQuizzesQuerySchema),
    asyncHandler(async (req, res) => {
      res.json(
        await study.listQuizzes(
          req.user!.id,
          req.query as unknown as z.infer<typeof listQuizzesQuerySchema>,
        ),
      );
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

  router.patch(
    '/quizzes/:id',
    auth,
    validateBody(updateQuizSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Quiz');
      res.json(await study.updateQuiz(req.user!.id, id, req.body));
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
