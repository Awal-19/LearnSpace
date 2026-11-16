import rateLimit, { type Options } from 'express-rate-limit';
import { AppError } from '../lib/errors';

type LimiterOptions = Partial<Pick<Options, 'windowMs' | 'limit' | 'skip' | 'keyGenerator'>>;

/**
 * Rate limiter that reports through the standard error envelope.
 * express-rate-limit sets the Retry-After header itself when it blocks.
 * Counters are in-memory (single instance in v1, see ARCHITECTURE.md section 9).
 */
export function createRateLimiter(options: LimiterOptions) {
  return rateLimit({
    ...options,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError('RATE_LIMITED')),
  });
}

