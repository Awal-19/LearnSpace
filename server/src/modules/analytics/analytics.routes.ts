import type { PrismaClient } from '@prisma/client';
import { Router } from 'express';
import type { Env } from '../../config/env';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler, validateQuery } from '../../middleware/validate';
import {
  analyticsRangeQuerySchema,
  getProgressAnalytics,
  type AnalyticsRange,
} from './analytics.service';

export function analyticsRouter(prisma: PrismaClient, env: Env): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);

  router.get(
    '/analytics',
    auth,
    validateQuery(analyticsRangeQuerySchema),
    asyncHandler(async (req, res) => {
      const { range } = req.query as { range: AnalyticsRange };
      res.json(await getProgressAnalytics(prisma, req.user!.id, range));
    }),
  );

  return router;
}
