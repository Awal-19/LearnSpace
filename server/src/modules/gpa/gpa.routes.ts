import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, validateBody } from '../../middleware/validate';
import {
  createGradeRecordSchema,
  createScaleSchema,
  updateGradeRecordSchema,
  updateScaleSchema,
  whatIfPlanSchema,
} from './gpa.schemas';
import type { GpaService } from './gpa.service';

const uuidSchema = z.string().uuid();
function parseUuid(raw: string | undefined, label: string): string {
  const parsed = uuidSchema.safeParse(raw ?? '');
  if (!parsed.success) throw new AppError('NOT_FOUND', `${label} not found`);
  return parsed.data;
}

export function gpaRouter(gpa: GpaService, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);

  router.get(
    '/gpa/overview',
    auth,
    asyncHandler(async (req, res) => {
      res.json(await gpa.getOverview(req.user!.id));
    }),
  );

  router.post(
    '/gpa/scales',
    auth,
    validateBody(createScaleSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await gpa.createScale(req.user!.id, req.body));
    }),
  );

  router.patch(
    '/gpa/scales/:id',
    auth,
    validateBody(updateScaleSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Grading scale');
      res.json(await gpa.updateScale(req.user!.id, id, req.body));
    }),
  );

  router.delete(
    '/gpa/scales/:id',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Grading scale');
      await gpa.deleteScale(req.user!.id, id);
      res.status(204).end();
    }),
  );

  router.post(
    '/gpa/records',
    auth,
    validateBody(createGradeRecordSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await gpa.createRecord(req.user!.id, req.body));
    }),
  );

  router.patch(
    '/gpa/records/:id',
    auth,
    validateBody(updateGradeRecordSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Grade record');
      res.json(await gpa.updateRecord(req.user!.id, id, req.body));
    }),
  );

  router.delete(
    '/gpa/records/:id',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Grade record');
      res.json(await gpa.deleteRecord(req.user!.id, id));
    }),
  );

  router.post(
    '/gpa/what-if',
    auth,
    validateBody(whatIfPlanSchema),
    asyncHandler(async (req, res) => {
      res.json(await gpa.whatIfPlan(req.user!.id, req.body));
    }),
  );

  return router;
}
