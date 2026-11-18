import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rateLimit';
import { asyncHandler, validateBody, validateQuery } from '../../middleware/validate';
import { createNoteSchema, listNotesQuerySchema, updateNoteSchema } from './notes.schemas';
import type { NotesService } from './notes.service';

const uuidSchema = z.string().uuid();
function parseUuid(raw: string | undefined, label: string): string {
  const parsed = uuidSchema.safeParse(raw ?? '');
  if (!parsed.success) throw new AppError('NOT_FOUND', `${label} not found`);
  return parsed.data;
}

export interface NotesRouterDeps {
  notes: NotesService;
  env: Env;
  isEmailVerified: (userId: string) => Promise<boolean>;
}

export function notesRouter({ notes, env, isEmailVerified }: NotesRouterDeps): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);
  const verified = requireVerifiedEmail(isEmailVerified);

  const summarizeLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: 10,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    skip: () => env.NODE_ENV === 'test',
  });

  // Notes
  router.get(
    '/notes',
    auth,
    validateQuery(listNotesQuerySchema),
    asyncHandler(async (req, res) => {
      res.json(
        await notes.listNotes(
          req.user!.id,
          req.query as unknown as z.infer<typeof listNotesQuerySchema>,
        ),
      );
    }),
  );

  router.post(
    '/notes',
    auth,
    validateBody(createNoteSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await notes.createNote(req.user!.id, req.body));
    }),
  );

  router.get(
    '/notes/:id',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Note');
      res.json(await notes.getNote(req.user!.id, id));
    }),
  );

  router.patch(
    '/notes/:id',
    auth,
    validateBody(updateNoteSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Note');
      res.json(await notes.updateNote(req.user!.id, id, req.body));
    }),
  );

  router.delete(
    '/notes/:id',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Note');
      await notes.deleteNote(req.user!.id, id);
      res.status(204).end();
    }),
  );

  router.post(
    '/notes/:id/summarize',
    auth,
    verified,
    summarizeLimiter,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Note');
      res.json(await notes.summarizeNote(req.user!.id, id));
    }),
  );

  return router;
}
