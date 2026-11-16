import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, validateBody, validateQuery } from '../../middleware/validate';
import {
  createTaskSchema,
  listNotificationsQuerySchema,
  listTasksQuerySchema,
  updateTaskSchema,
} from './planner.schemas';
import type { PlannerService } from './planner.service';

const uuidSchema = z.string().uuid();
function parseUuid(raw: string | undefined, label: string): string {
  const parsed = uuidSchema.safeParse(raw ?? '');
  if (!parsed.success) throw new AppError('NOT_FOUND', `${label} not found`);
  return parsed.data;
}

export function plannerRouter(planner: PlannerService, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);

  router.get(
    '/tasks',
    auth,
    validateQuery(listTasksQuerySchema),
    asyncHandler(async (req, res) => {
      res.json(
        await planner.listTasks(
          req.user!.id,
          req.query as unknown as z.infer<typeof listTasksQuerySchema>,
        ),
      );
    }),
  );

  router.post(
    '/tasks',
    auth,
    validateBody(createTaskSchema),
    asyncHandler(async (req, res) => {
      res.status(201).json(await planner.createTask(req.user!.id, req.body));
    }),
  );

  router.patch(
    '/tasks/:id',
    auth,
    validateBody(updateTaskSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Task');
      res.json(await planner.updateTask(req.user!.id, id, req.body));
    }),
  );

  router.delete(
    '/tasks/:id',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Task');
      await planner.deleteTask(req.user!.id, id);
      res.status(204).end();
    }),
  );

  router.get(
    '/notifications',
    auth,
    validateQuery(listNotificationsQuerySchema),
    asyncHandler(async (req, res) => {
      res.json(
        await planner.listNotifications(
          req.user!.id,
          req.query as unknown as z.infer<typeof listNotificationsQuerySchema>,
        ),
      );
    }),
  );

  router.post(
    '/notifications/:id/read',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuid(req.params.id, 'Notification');
      await planner.markNotificationRead(req.user!.id, id);
      res.status(204).end();
    }),
  );

  router.post(
    '/notifications/read-all',
    auth,
    asyncHandler(async (req, res) => {
      await planner.markAllNotificationsRead(req.user!.id);
      res.status(204).end();
    }),
  );

  return router;
}

