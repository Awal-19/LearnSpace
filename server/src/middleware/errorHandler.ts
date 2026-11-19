import type { PrismaClient } from '@prisma/client';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError, ERROR_STATUS, type ErrorCode } from '../lib/errors';
import { reportToSentry } from '../lib/securityMonitor';
import { recordErrorLog } from '../modules/admin/admin.logging';

interface Envelope {
  error: { code: ErrorCode; message: string; details?: unknown; requestId: string };
}

function bodyParserErrorType(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const type = (err as { type: unknown }).type;
    return typeof type === 'string' ? type : undefined;
  }
  return undefined;
}

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError('NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

/**
 * One place that turns every failure into the documented envelope.
 * Unknown errors become INTERNAL; their message/stack are logged, never returned.
 */
export function createErrorHandler(prisma?: PrismaClient, sentryDsn?: string): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) {
      next(err);
      return;
    }

    let code: ErrorCode = 'INTERNAL';
    let message: string | undefined;
    let details: unknown;

    if (err instanceof AppError) {
      code = err.code;
      message = err.message;
      details = err.details;
    } else if (err instanceof ZodError) {
      code = 'VALIDATION_ERROR';
      details = err.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
    } else {
      const type = bodyParserErrorType(err);
      if (type === 'entity.too.large') code = 'PAYLOAD_TOO_LARGE';
      else if (type === 'entity.parse.failed') {
        code = 'VALIDATION_ERROR';
        message = 'Malformed JSON body';
      }
    }

    const status = ERROR_STATUS[code];
    if (code === 'FORBIDDEN') {
      req.log?.warn(
        {
          securityEvent: 'permission_denied',
          requestId: req.requestId,
          userId: req.user?.id ?? null,
          route: req.originalUrl || req.path,
          method: req.method,
        },
        'Permission denied',
      );
    }
    if (status >= 500) {
      req.log?.error({ err, requestId: req.requestId }, 'Unhandled error');
      void reportToSentry(sentryDsn, err, {
        requestId: req.requestId,
        route: req.originalUrl || req.path,
        method: req.method,
        userId: req.user?.id ?? null,
      });
      if (prisma) {
        const errMsg = err instanceof Error ? err.message : 'Internal server error';
        void recordErrorLog(prisma, {
          route: req.originalUrl || req.path,
          method: req.method,
          statusCode: status,
          code,
          message: errMsg,
          userId: req.user?.id ?? null,
          requestId: req.requestId,
        });
      }
    }

    const body: Envelope = {
      error: {
        code,
        message: message ?? new AppError(code).message,
        ...(details !== undefined ? { details } : {}),
        requestId: req.requestId,
      },
    };
    res.status(status).json(body);
  };
}

export const errorHandler: ErrorRequestHandler = createErrorHandler();
