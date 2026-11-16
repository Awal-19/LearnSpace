import { Router } from 'express';
import { asyncHandler } from '../../middleware/validate';

export interface HealthDeps {
  /** Resolves if the database answers; rejects otherwise. */
  checkDb: () => Promise<void>;
}

const READY_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export function healthRouter(deps: HealthDeps): Router {
  const router = Router();

  // Liveness: the process is up.
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness: dependencies are reachable (used by the platform health check).
  router.get(
    '/health/ready',
    asyncHandler(async (req, res) => {
      try {
        await withTimeout(deps.checkDb(), READY_TIMEOUT_MS);
        res.json({ status: 'ok' });
      } catch (err) {
        req.log?.error({ err }, 'Readiness check failed');
        res.status(503).json({ status: 'unavailable' });
      }
    }),
  );

  return router;
}
