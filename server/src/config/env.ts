import { z } from 'zod';

/** Required variables checked at startup before binding HTTP. */
export const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET'] as const;

/** Recommended production environment variables for Railway + cross-origin frontends. */
export const RECOMMENDED_PROD_ENV_VARS = [
  'NODE_ENV',
  'PORT',
  'CLIENT_URL',
  'CORS_ORIGIN',
  'TRUST_PROXY',
] as const;

/** Treat an empty string (e.g. `KEY=` in .env) as "not set". */
const optionalString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().optional(),
);

/**
 * Ensures external Railway Postgres proxy URLs (*.rlwy.net / *.railway.app) enable SSL by default
 * when `sslmode` is unspecified, while preserving internal/local URLs (e.g. *.railway.internal, localhost).
 */
export function normalizeDatabaseUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();
    const isRailwayPublicProxy =
      (host.endsWith('.rlwy.net') || host.endsWith('.railway.app')) &&
      !host.endsWith('.railway.internal');
    if (isRailwayPublicProxy && !parsed.searchParams.has('sslmode')) {
      parsed.searchParams.set('sslmode', 'require');
      return parsed.toString();
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required' })
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must start with postgresql:// or postgres://'),

  JWT_SECRET: z
    .string({ required_error: 'JWT_SECRET is required' })
    .min(32, 'JWT_SECRET must be at least 32 characters'),

  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGIN: optionalString,
  TRUST_PROXY: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number().int().min(0).max(10).optional(),
  ),
  RATE_LIMIT_GLOBAL_PER_MIN: z.coerce.number().int().min(1).default(600),

  // Later phases. Optional here; the feature that needs them checks at use time.
  EMAIL_PROVIDER: z.enum(['auto', 'resend', 'smtp', 'emailjs']).default('auto'),
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: optionalString,
  SMTP_URL: optionalString,
  EMAILJS_SERVICE_ID: optionalString,
  EMAILJS_TEMPLATE_ID: optionalString,
  EMAILJS_RESET_TEMPLATE_ID: optionalString,
  EMAILJS_PUBLIC_KEY: optionalString,
  EMAILJS_PRIVATE_KEY: optionalString,
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_CALLBACK_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().url('GOOGLE_CALLBACK_URL must be a valid URL').optional(),
  ),
  CLOUDINARY_URL: optionalString,
  GEMINI_API_KEY: optionalString,
  NVIDIA_API_KEY: optionalString,
  NVIDIA_BASE_URL: z.string().url().default('https://integrate.api.nvidia.com/v1'),
  NVIDIA_MODEL: z.string().trim().min(1).default('z-ai/glm-5.3-flash'),
  NVIDIA_VISION_MODEL: z.string().trim().min(1).default('nvidia/nemotron-3.5-super-vl-120b-a12b'),
  STT_PROVIDER: z.enum(['nvidia_riva', 'openai_http', 'gemini']).default('nvidia_riva'),
  NVIDIA_ASR_GRPC_URL: z.string().trim().min(1).default('grpc.nvcf.nvidia.com:443'),
  NVIDIA_ASR_FUNCTION_ID: z.string().trim().min(1).default('d3fe9151-442b-4204-a70d-5fcc597fd610'),
  STT_HTTP_URL: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().url('STT_HTTP_URL must be a valid URL').optional(),
  ),
  STT_HTTP_API_KEY: optionalString,
  STT_HTTP_MODEL: z.string().trim().min(1).default('whisper-1'),
  AI_DAILY_TRANSCRIPTION_LIMIT: z.coerce.number().int().positive().default(60),
  AI_TRANSCRIPTION_COST_ALERT_USD: z.coerce.number().positive().default(5),
  AI_DAILY_TOKEN_LIMIT: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),
  ADMIN_EMAIL: optionalString,
  ADMIN_CONSOLE_PASSWORD: optionalString,
  TURNSTILE_SECRET_KEY: optionalString,
  HCAPTCHA_SECRET_KEY: optionalString,
  MALWARE_SCANNER_URL: optionalString,
  SENTRY_DSN: optionalString,
});

export type Env = Omit<z.infer<typeof schema>, 'TRUST_PROXY'> & {
  TRUST_PROXY: number;
  CORS_ORIGINS: string[];
};

export class EnvError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvError';
  }
}

const WEAK_SECRET_PREFIXES = [
  'change-me',
  'replace-with',
  'dev-secret',
  'test-secret',
  'example',
  'your-',
];

const WEAK_PASSWORDS = new Set([
  'postgres',
  'learnspace',
  'password',
  'password123',
  'changeme',
  'admin',
  'admin123',
  'root',
  '123456',
  '12345678',
]);

function assertProductionSecrets(env: z.infer<typeof schema>): void {
  if (env.NODE_ENV !== 'production') return;

  const issues: string[] = [];
  const lowerJwt = env.JWT_SECRET.trim().toLowerCase();
  if (
    WEAK_SECRET_PREFIXES.some((prefix) => lowerJwt.startsWith(prefix)) ||
    lowerJwt === 'secret' ||
    lowerJwt === 'jwt_secret'
  ) {
    issues.push('JWT_SECRET: must not use a placeholder or default value in production');
  } else if (new Set(env.JWT_SECRET).size < 8) {
    issues.push('JWT_SECRET: must contain at least 8 distinct characters in production');
  }

  try {
    const dbUrl = new URL(env.DATABASE_URL);
    const host = dbUrl.hostname.toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const dbPass = decodeURIComponent(dbUrl.password || '')
      .trim()
      .toLowerCase();
    if (!isLocalHost && (!dbPass || WEAK_PASSWORDS.has(dbPass))) {
      issues.push('DATABASE_URL: must use a strong, non-default database password in production');
    }
  } catch {
    issues.push('DATABASE_URL: must be a valid PostgreSQL connection URL');
  }

  if (env.ADMIN_CONSOLE_PASSWORD) {
    const adminPass = env.ADMIN_CONSOLE_PASSWORD.trim();
    if (adminPass.length < 8 || WEAK_PASSWORDS.has(adminPass.toLowerCase())) {
      issues.push(
        'ADMIN_CONSOLE_PASSWORD: must be at least 8 characters and not a default password in production',
      );
    }
  }

  if (issues.length > 0) {
    throw new EnvError(issues);
  }
}

/**
 * Validates configuration. Error messages list variable names and rules only;
 * they never echo the offending values, so secrets cannot leak into logs.
 */
export function loadEnv(
  source: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvError(
      result.error.issues.map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`),
    );
  }
  const env = result.data;

  assertProductionSecrets(env);

  const trustProxy =
    env.TRUST_PROXY ??
    (env.NODE_ENV === 'production' ||
    Boolean(
      source.RENDER ||
      source.RAILWAY_ENVIRONMENT ||
      source.RAILWAY_PROJECT_ID ||
      source.RAILWAY_STATIC_URL,
    )
      ? 1
      : 0);

  const normalizedDbUrl = normalizeDatabaseUrl(env.DATABASE_URL);
  const origins = (env.CORS_ORIGIN ?? env.CLIENT_URL)
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);

  return {
    ...env,
    TRUST_PROXY: trustProxy,
    DATABASE_URL: normalizedDbUrl,
    CORS_ORIGINS: origins,
  };
}
