export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_TOKEN'
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'INVALID_CREDENTIALS'
  | 'REFRESH_INVALID'
  | 'EMAIL_NOT_VERIFIED'
  | 'FORBIDDEN'
  | 'GUARDIAN_CONSENT_REQUIRED'
  | 'ACCOUNT_SUSPENDED'
  | 'CSRF_BLOCKED'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'ACCOUNT_LOCKED'
  | 'RATE_LIMITED'
  | 'AI_BUDGET_EXCEEDED'
  | 'AI_PROVIDER_ERROR'
  | 'AI_BAD_OUTPUT'
  | 'AI_UNAVAILABLE'
  | 'STORAGE_UNAVAILABLE'
  | 'INTERNAL';

/** Single source of truth for code -> HTTP status. Mirrors docs/API.md. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  INVALID_TOKEN: 400,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  REFRESH_INVALID: 401,
  EMAIL_NOT_VERIFIED: 403,
  FORBIDDEN: 403,
  GUARDIAN_CONSENT_REQUIRED: 403,
  ACCOUNT_SUSPENDED: 403,
  CSRF_BLOCKED: 403,
  NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  ACCOUNT_LOCKED: 423,
  RATE_LIMITED: 429,
  AI_BUDGET_EXCEEDED: 429,
  AI_PROVIDER_ERROR: 502,
  AI_BAD_OUTPUT: 502,
  AI_UNAVAILABLE: 503,
  STORAGE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Invalid input',
  INVALID_TOKEN: 'This link is invalid or has expired',
  UNAUTHENTICATED: 'Please log in to continue',
  TOKEN_EXPIRED: 'Your session has expired',
  INVALID_CREDENTIALS: 'Invalid email or password',
  REFRESH_INVALID: 'Your session is no longer valid. Please log in again',
  EMAIL_NOT_VERIFIED: 'Please verify your email to use this feature',
  FORBIDDEN: 'You do not have permission to access this resource',
  GUARDIAN_CONSENT_REQUIRED:
    'Guardian consent is required before this account can access LearnSpace.',
  ACCOUNT_SUSPENDED: 'Your account has been suspended. Please contact support.',
  CSRF_BLOCKED: 'Request blocked',
  NOT_FOUND: 'Not found',
  EMAIL_TAKEN: 'Email already in use',
  CONFLICT: 'Conflict with existing data',
  PAYLOAD_TOO_LARGE: 'Request is too large',
  UNSUPPORTED_MEDIA_TYPE: 'Unsupported file type',
  ACCOUNT_LOCKED: 'Too many failed attempts. Try again later',
  RATE_LIMITED: 'Too many requests. Please slow down',
  AI_BUDGET_EXCEEDED: 'Daily AI limit reached',
  AI_PROVIDER_ERROR: 'The AI service had a problem. Please try again',
  AI_BAD_OUTPUT: 'The AI returned an unusable answer. Please try again',
  AI_UNAVAILABLE: 'The AI service is not available right now',
  STORAGE_UNAVAILABLE: 'File storage is not available right now',
  INTERNAL: 'Something went wrong',
};

/** An error that is safe to show to the client. Anything else becomes INTERNAL. */
export class AppError extends Error {
  readonly status: number;

  constructor(
    public readonly code: ErrorCode,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? DEFAULT_MESSAGE[code]);
    this.name = 'AppError';
    this.status = ERROR_STATUS[code];
  }
}
