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
import {
  refreshRecommendationsSchema,
  reportRecommendationSchema,
  updateAssistantResourcesToggleSchema,
} from './recommendations.schemas';
import type { RecommendationsService } from './recommendations.service';

const uuidSchema = z.string().uuid();
function parseUuid(raw: string | undefined, label: string): string {
  const parsed = uuidSchema.safeParse(raw ?? '');
  if (!parsed.success) throw new AppError('NOT_FOUND', `${label} not found`);
  return parsed.data;
}

export function coursesRouter(
  courses: CoursesService,
  env: Env,
  recommendations?: RecommendationsService,
): Router {
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

  if (recommendations) {
    router.get(
      '/courses/:id/recommendations',
      auth,
      asyncHandler(async (req, res) => {
        const id = parseUuid(req.params.id, 'Course');
        res.json(await recommendations.listForCourse(req.user!.id, id));
      }),
    );

    router.post(
      '/courses/:id/recommendations/refresh',
      auth,
      validateBody(refreshRecommendationsSchema),
      asyncHandler(async (req, res) => {
        const id = parseUuid(req.params.id, 'Course');
        res.status(202).json(await recommendations.triggerRefresh(req.user!.id, id, req.body));
      }),
    );

    router.post(
      '/courses/:id/recommendations/:recId/save',
      auth,
      asyncHandler(async (req, res) => {
        const id = parseUuid(req.params.id, 'Course');
        const recId = parseUuid(req.params.recId, 'Recommendation');
        res.status(201).json(await recommendations.saveRecommendation(req.user!.id, id, recId));
      }),
    );

    router.delete(
      '/courses/:id/resources/:resourceId',
      auth,
      asyncHandler(async (req, res) => {
        const id = parseUuid(req.params.id, 'Course');
        const resourceId = parseUuid(req.params.resourceId, 'Resource');
        await recommendations.removeResource(req.user!.id, id, resourceId);
        res.status(204).end();
      }),
    );

    router.patch(
      '/courses/:id/resources/assistant-toggle',
      auth,
      validateBody(updateAssistantResourcesToggleSchema),
      asyncHandler(async (req, res) => {
        const id = parseUuid(req.params.id, 'Course');
        res.json(
          await recommendations.toggleUseInAssistant(
            req.user!.id,
            id,
            req.body.useResourcesInAssistant,
          ),
        );
      }),
    );

    router.post(
      '/courses/:id/recommendations/:recId/hide',
      auth,
      asyncHandler(async (req, res) => {
        const id = parseUuid(req.params.id, 'Course');
        const recId = parseUuid(req.params.recId, 'Recommendation');
        await recommendations.hideRecommendation(req.user!.id, id, recId);
        res.status(204).end();
      }),
    );

    router.post(
      '/courses/:id/recommendations/:recId/report',
      auth,
      validateBody(reportRecommendationSchema),
      asyncHandler(async (req, res) => {
        const id = parseUuid(req.params.id, 'Course');
        const recId = parseUuid(req.params.recId, 'Recommendation');
        res
          .status(201)
          .json(
            await recommendations.reportRecommendation(req.user!.id, id, recId, req.body.reason),
          );
      }),
    );
  }

  return router;
}
