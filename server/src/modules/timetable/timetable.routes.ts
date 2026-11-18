import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, validateBody } from '../../middleware/validate';
import { createTimetableSchema, updateTimetableSchema } from './timetable.schemas';
import type { TimetableService } from './timetable.service';

const uuidSchema = z.string().uuid();

function parseEntryId(raw: string | undefined): string {
  const parsed = uuidSchema.safeParse(raw ?? '');
  if (!parsed.success) throw new AppError('NOT_FOUND', 'Timetable entry not found');
  return parsed.data;
}

export function timetableRouter(timetable: TimetableService, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);

  router.get(
    '/timetable',
    auth,
    asyncHandler(async (req, res) => {
      res.json(await timetable.listEntries(req.user!.id));
    }),
  );

  router.post(
    '/timetable',
    auth,
    validateBody(createTimetableSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await timetable.createEntry(req.user!.id, req.body));
    }),
  );

  router.patch(
    '/timetable/:id',
    auth,
    validateBody(updateTimetableSchema),
    asyncHandler(async (req, res) => {
      res.json(await timetable.updateEntry(req.user!.id, parseEntryId(req.params.id), req.body));
    }),
  );

  router.delete(
    '/timetable/:id',
    auth,
    asyncHandler(async (req, res) => {
      await timetable.deleteEntry(req.user!.id, parseEntryId(req.params.id));
      res.status(204).end();
    }),
  );

  return router;
}
