import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, validateBody, validateQuery } from '../../middleware/validate';
import {
  createCourseSchema,
  deleteCourseQuerySchema,
  listCoursesQuerySchema,
  updateCourseSchema,
} from './courses.schemas';
import type { CoursesService } from './courses.service';

const uuidSchema = z.string().uuid();
function parseUuid(raw: string | undefined, label: string): string {
  const parsed = uuidSchema.safeParse(raw ?? '');
  if (!parsed.success) throw new AppError('NOT_FOUND', `${label} not found`);
  return parsed.data;
}

export function coursesRouter(courses: CoursesService, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);

  router.get(
    '/courses',
    auth,
    validateQuery(listCoursesQuerySchema),
    asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof listCoursesQuerySchema>;
      res.json(await courses.listCourses(req.user!.id, query));
    }),
  );

  router.post(
    '/courses',
    auth,
    validateBody(createCourseSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await courses.createCourse(req.user!.id, req.body));
    }),
  );

  router.get(
    '/courses/:id',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Course');
      res.json(await courses.getCourseDetail(req.user!.id, id));
    }),
  );

  router.patch(
    '/courses/:id',
    auth,
    validateBody(updateCourseSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Course');
      res.json(await courses.updateCourse(req.user!.id, id, req.body));
    }),
  );

  router.delete(
    '/courses/:id',
    auth,
    validateQuery(deleteCourseQuerySchema),
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Course');
      const query = req.query as unknown as z.infer<typeof deleteCourseQuerySchema>;
      await courses.deleteCourse(req.user!.id, id, query.mode);
      res.status(204).end();
    }),
  );

  return router;
}
