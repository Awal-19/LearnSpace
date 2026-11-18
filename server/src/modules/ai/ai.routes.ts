import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Env } from '../../config/env';
import { AppError } from '../../lib/errors';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rateLimit';
import { asyncHandler, validateBody, validateQuery } from '../../middleware/validate';
import {
  createConversationSchema,
  getConversationQuerySchema,
  listConversationsQuerySchema,
  renameConversationSchema,
  sendMessageSchema,
} from './ai.schemas';
import { AI_REQUESTS_PER_MINUTE, type AiService } from './ai.service';

const uuidParamSchema = z.string().uuid();

function parseUuidParam(raw: string | undefined): string {
  const parsed = uuidParamSchema.safeParse(raw ?? '');
  if (!parsed.success) throw new AppError('NOT_FOUND', 'Conversation not found');
  return parsed.data;
}

function writeSse(res: Response, event: string, data: unknown): void {
  if (res.writableEnded) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export interface AiRouterDeps {
  ai: AiService;
  env: Env;
  isEmailVerified: (userId: string) => Promise<boolean>;
}

export function aiRouter({ ai, env, isEmailVerified }: AiRouterDeps): Router {
  const router = Router();
  const auth = requireAuth(env.JWT_SECRET);
  const verified = requireVerifiedEmail(isEmailVerified);

  const aiRateLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: AI_REQUESTS_PER_MINUTE,
    keyGenerator: (req) => req.user?.id ?? req.ip ?? 'unknown',
    skip: () => env.NODE_ENV === 'test',
  });

  router.get(
    '/conversations',
    auth,
    validateQuery(listConversationsQuerySchema),
    asyncHandler(async (req, res) => {
      const result = await ai.listConversations(
        req.user!.id,
        req.query as unknown as z.infer<typeof listConversationsQuerySchema>,
      );
      res.json(result);
    }),
  );

  router.post(
    '/conversations',
    auth,
    validateBody(createConversationSchema),
    asyncHandler(async (req, res) => {
      const conv = await ai.createConversation(req.user!.id, req.body);
      res.status(201).json(conv);
    }),
  );

  router.get(
    '/conversations/:id',
    auth,
    validateQuery(getConversationQuerySchema),
    asyncHandler(async (req, res) => {
      const id = parseUuidParam(req.params.id);
      const result = await ai.getConversation(
        req.user!.id,
        id,
        req.query as unknown as z.infer<typeof getConversationQuerySchema>,
      );
      res.json(result);
    }),
  );

  router.patch(
    '/conversations/:id',
    auth,
    validateBody(renameConversationSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuidParam(req.params.id);
      const updated = await ai.renameConversation(req.user!.id, id, req.body);
      res.json(updated);
    }),
  );

  router.delete(
    '/conversations/:id',
    auth,
    asyncHandler(async (req, res) => {
      const id = parseUuidParam(req.params.id);
      await ai.deleteConversation(req.user!.id, id);
      res.status(204).end();
    }),
  );

  router.get(
    '/ai/usage',
    auth,
    asyncHandler(async (req, res) => {
      const usage = await ai.getUsage(req.user!.id);
      res.json(usage);
    }),
  );

  router.post(
    '/conversations/:id/messages',
    auth,
    verified,
    aiRateLimiter,
    validateBody(sendMessageSchema),
    asyncHandler(async (req, res) => {
      const id = parseUuidParam(req.params.id);
      const abortController = new AbortController();

      req.on('close', () => {
        if (!res.writableEnded) {
          abortController.abort();
        }
      });

      let headersSent = false;
      const ensureStreamHeaders = () => {
        if (headersSent) return;
        headersSent = true;
        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
      };

      await ai.streamMessage(req.user!.id, id, req.body, abortController.signal, {
        onMeta(meta) {
          ensureStreamHeaders();
          writeSse(res, 'meta', meta);
        },
        onDelta(text) {
          ensureStreamHeaders();
          writeSse(res, 'delta', { text });
        },
        onDone(done) {
          ensureStreamHeaders();
          writeSse(res, 'done', done);
          res.end();
        },
        onError(code, message) {
          ensureStreamHeaders();
          writeSse(res, 'error', { code, message });
          res.end();
        },
      });

      if (headersSent && !res.writableEnded) {
        res.end();
      }
    }),
  );

  return router;
}
