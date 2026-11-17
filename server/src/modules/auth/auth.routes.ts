import { Router, type CookieOptions, type Request } from 'express';
import type { Env } from '../../config/env';
import { csrfGuard, requireAuth } from '../../middleware/auth';
import { createRateLimiter } from '../../middleware/rateLimit';
import { asyncHandler, validate } from '../../middleware/validate';
import { REFRESH_TTL_PERSISTENT_MS } from '../../lib/tokens';
import {
  adminTwoFactorSchema,
  forgotPasswordSchema,
  loginSchema,
  resendOtpSchema,
  resetPasswordSchema,
  signupSchema,
  verifyEmailSchema,
  verifyOtpSchema,
} from './auth.schemas';
import type { AuthService } from './auth.service';

export const REFRESH_COOKIE_NAME = 'ls_refresh';
const OAUTH_COOKIE_NAME = 'ls_oauth';

function refreshCookieOptions(isProd: boolean, persistent: boolean): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/api/v1/auth',
    ...(persistent ? { maxAge: REFRESH_TTL_PERSISTENT_MS } : {}),
  };
}

function sessionMeta(req: Request) {
  return {
    userAgent: req.header('user-agent')?.slice(0, 250),
    ip: req.ip,
  };
}

export function authRouter(
  service: AuthService,
  env: Pick<Env, 'NODE_ENV' | 'JWT_SECRET' | 'CLIENT_URL'> & Partial<Pick<Env, 'GOOGLE_CALLBACK_URL'>>,
): Router {
  const router = Router();
  const isProd = env.NODE_ENV === 'production';
  const auth = requireAuth(env.JWT_SECRET);

  const authLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: env.NODE_ENV === 'test' ? 1000 : 10,
  });

  const emailLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: env.NODE_ENV === 'test' ? 1000 : 3,
    keyGenerator: (req) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
      return req.user?.id ?? (email || req.ip || 'unknown');
    },
  });

  const otpEmailLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: env.NODE_ENV === 'test' ? 1000 : 5,
    keyGenerator: (req) => {
      const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : '';
      return `otp-email:${email || req.ip || 'unknown'}`;
    },
  });

  const otpIpLimiter = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: env.NODE_ENV === 'test' ? 1000 : 5,
    keyGenerator: (req) => `otp-ip:${req.ip ?? 'unknown'}`,
  });

  router.get('/auth/providers', (_req, res) => {
    res.json(service.getProviders());
  });

  router.post(
    '/auth/signup',
    authLimiter,
    validate({ body: signupSchema }),
    asyncHandler(async (req, res) => {
      const result = await service.signup(req.body, sessionMeta(req));
      res.status(201).json(result);
    }),
  );

  router.post(
    '/auth/verify-otp',
    authLimiter,
    validate({ body: verifyOtpSchema }),
    asyncHandler(async (req, res) => {
      const result = await service.verifyOtp(req.body, sessionMeta(req));
      res.cookie(REFRESH_COOKIE_NAME, result.rawRefreshToken, refreshCookieOptions(isProd, result.persistent));
      res.json({
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        user: result.user,
      });
    }),
  );

  router.post(
    '/auth/resend-otp',
    otpIpLimiter,
    otpEmailLimiter,
    validate({ body: resendOtpSchema }),
    asyncHandler(async (req, res) => {
      const result = await service.resendOtp(req.body.email);
      res.json(result);
    }),
  );

  router.post(
    '/auth/login',
    authLimiter,
    validate({ body: loginSchema }),
    asyncHandler(async (req, res) => {
      const result = await service.login(req.body, sessionMeta(req));
      if ('requiresTwoFactor' in result && result.requiresTwoFactor) {
        res.json({ requiresTwoFactor: true, email: result.email });
        return;
      }
      res.cookie(REFRESH_COOKIE_NAME, result.rawRefreshToken, refreshCookieOptions(isProd, result.persistent));
      res.json({
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        user: result.user,
      });
    }),
  );

  router.post(
    '/auth/admin-2fa/verify',
    authLimiter,
    validate({ body: adminTwoFactorSchema }),
    asyncHandler(async (req, res) => {
      const result = await service.verifyAdminTwoFactor(
        req.body.email,
        req.body.code,
        sessionMeta(req),
      );
      res.cookie(REFRESH_COOKIE_NAME, result.rawRefreshToken, refreshCookieOptions(isProd, result.persistent));
      res.json({
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        user: result.user,
      });
    }),
  );

  router.post(
    '/auth/refresh',
    csrfGuard,
    asyncHandler(async (req, res) => {
      const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
      const result = await service.refresh(raw, sessionMeta(req));
      res.cookie(REFRESH_COOKIE_NAME, result.rawRefreshToken, refreshCookieOptions(isProd, result.persistent));
      res.json({
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
        user: result.user,
      });
    }),
  );

  router.post(
    '/auth/logout',
    csrfGuard,
    asyncHandler(async (req, res) => {
      const raw = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
      await service.logout(raw);
      res.clearCookie(REFRESH_COOKIE_NAME, {
        path: '/api/v1/auth',
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
      });
      res.status(204).end();
    }),
  );

  router.post(
    '/auth/logout-all',
    auth,
    asyncHandler(async (req, res) => {
      await service.logoutAll(req.user!.id);
      res.clearCookie(REFRESH_COOKIE_NAME, {
        path: '/api/v1/auth',
        httpOnly: true,
        secure: isProd,
        sameSite: isProd ? 'none' : 'lax',
      });
      res.status(204).end();
    }),
  );

  router.post(
    '/auth/verify-email',
    authLimiter,
    validate({ body: verifyEmailSchema }),
    asyncHandler(async (req, res) => {
      const result = await service.verifyEmail(req.body.token);
      res.json(result);
    }),
  );

  router.post(
    '/auth/resend-verification',
    auth,
    emailLimiter,
    asyncHandler(async (req, res) => {
      const result = await service.resendVerification(req.user!.id);
      res.status(result.sent ? 202 : 200).json(result);
    }),
  );

  router.post(
    '/auth/forgot-password',
    emailLimiter,
    validate({ body: forgotPasswordSchema }),
    asyncHandler(async (req, res) => {
      const result = await service.forgotPassword(req.body.email);
      res.status(202).json(result);
    }),
  );

  router.post(
    '/auth/reset-password',
    authLimiter,
    validate({ body: resetPasswordSchema }),
    asyncHandler(async (req, res) => {
      const result = await service.resetPassword(req.body);
      res.json(result);
    }),
  );

  const resolveGoogleCallbackUrl = (req: Request) =>
    env.GOOGLE_CALLBACK_URL ?? `${req.protocol}://${req.get('host')}/api/v1/auth/google/callback`;

  router.get('/auth/google', (req, res) => {
    const redirectUri = resolveGoogleCallbackUrl(req);
    const { url, state, codeVerifier } = service.beginGoogleOAuth(redirectUri);
    res.cookie(OAUTH_COOKIE_NAME, JSON.stringify({ state, codeVerifier }), {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/api/v1/auth/google',
      maxAge: 10 * 60 * 1000,
    });
    res.redirect(302, url);
  });

  router.get(
    '/auth/google/callback',
    asyncHandler(async (req, res) => {
      const failWith = (reason: 'google_denied' | 'google_state' | 'google_failed') =>
        `${env.CLIENT_URL}/login?error=${reason}`;
      const rawCookie = req.cookies?.[OAUTH_COOKIE_NAME] as string | undefined;
      res.clearCookie(OAUTH_COOKIE_NAME, { path: '/api/v1/auth/google' });

      if (typeof req.query.error === 'string') {
        res.redirect(
          302,
          failWith(req.query.error === 'access_denied' ? 'google_denied' : 'google_failed'),
        );
        return;
      }

      if (!rawCookie || typeof req.query.code !== 'string' || typeof req.query.state !== 'string') {
        res.redirect(302, failWith('google_state'));
        return;
      }

      try {
        const parsed = JSON.parse(rawCookie) as { state?: string; codeVerifier?: string };
        if (!parsed.state || !parsed.codeVerifier || parsed.state !== req.query.state) {
          res.redirect(302, failWith('google_state'));
          return;
        }
        const redirectUri = resolveGoogleCallbackUrl(req);
        const result = await service.completeGoogleOAuth(
          req.query.code,
          parsed.codeVerifier,
          redirectUri,
          sessionMeta(req),
        );
        res.cookie(REFRESH_COOKIE_NAME, result.rawRefreshToken, refreshCookieOptions(isProd, result.persistent));
        res.redirect(302, `${env.CLIENT_URL}/auth/callback`);
      } catch {
        res.redirect(302, failWith('google_failed'));
      }
    }),
  );

  return router;
}

