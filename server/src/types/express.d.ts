export {};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlation id: echoed in X-Request-Id, logs, and error envelopes. */
      requestId: string;
      /** Authenticated user from verified access token. */
      user?: { id: string; iat?: number };
    }
  }
}

