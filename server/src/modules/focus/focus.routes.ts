import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, validateBody, validateQuery } from '../../middleware/validate';
import { createStudySessionSchema, listStudySessionsQuerySchema } from './focus.schemas';
import type { FocusService } from './focus.service';

const uuidSchema = z.string().uuid();

export function focusRouter(focus: FocusService, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);

  router.post(
    '/study-sessions',
    auth,
    validateBody(createStudySessionSchema),
    asyncHandler(async (req, res) => {
      const session = await focus.createSession(req.user!.id, req.body);
      res.status(201).json(session);
    }),
  );

  router.get(
    '/study-sessions',
    auth,
    validateQuery(listStudySessionsQuerySchema),
    asyncHandler(async (req, res) => {
      const result = await focus.listSessions(
        req.user!.id,
        req.query as unknown as z.infer<typeof listStudySessionsQuerySchema>,
      );
      res.json(result);
    }),
  );

  router.delete(
    '/study-sessions/:id',
    auth,
    asyncHandler(async (req, res) => {
      const parsed = uuidSchema.safeParse(req.params.id);
      if (!parsed.success) throw new AppError('NOT_FOUND', 'Study session not found');
      await focus.deleteSession(req.user!.id, parsed.data);
      res.status(204).end();
    }),
  );

  return router;
}
