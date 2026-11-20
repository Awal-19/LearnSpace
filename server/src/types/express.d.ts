export {};

declare global {
  namespace Express {
    interface Request {
      /** Correlation id: echoed in X-Request-Id, logs, and error envelopes. */
      requestId: string;
      /** Authenticated user from verified access token. */
      user?: { id: string; iat?: number; scope?: 'full' | 'verify_only' };
      /** Verified role attached by requireAdmin / requireSuperAdmin. */
      adminRole?: 'student' | 'admin' | 'super_admin';
      /** Granular admin permissions attached by requireAdmin / requireSuperAdmin. */
      adminPermissions?: Record<string, boolean>;
    }
  }
}
