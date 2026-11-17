import type {
  AppSettings,
  LoginMethod,
  Prisma,
  PrismaClient,
  UsageFeature,
  UsageStatus,
} from '@prisma/client';

/** Approximate blended USD per 1M tokens for cost estimation on the AI Usage dashboard. */
export function estimateCostUsd(tokensIn: number, tokensOut: number, model?: string | null): number {
  const m = (model ?? '').toLowerCase();
  const inRate = m.includes('120b') || m.includes('pro') ? 0.6 : 0.15;
  const outRate = m.includes('120b') || m.includes('pro') ? 1.8 : 0.6;
  const cost = (tokensIn / 1_000_000) * inRate + (tokensOut / 1_000_000) * outRate;
  return Number(cost.toFixed(6));
}

export async function recordAuditLog(
  prisma: PrismaClient,
  entry: {
    actorId: string;
    action: string;
    targetType: string;
    targetId?: string | null;
    reason?: string | null;
    metadata?: Record<string, unknown>;
    before?: unknown;
    after?: unknown;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<void> {
  if (!prisma.auditLog?.create) return;
  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: entry.action.slice(0, 120),
      targetType: entry.targetType.slice(0, 80),
      targetId: entry.targetId?.slice(0, 120) ?? null,
      reason: entry.reason?.slice(0, 1000) ?? null,
      metadataJson: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      ...(entry.before !== undefined ? { beforeJson: entry.before as Prisma.InputJsonValue } : {}),
      ...(entry.after !== undefined ? { afterJson: entry.after as Prisma.InputJsonValue } : {}),
      ip: entry.ip?.slice(0, 64) ?? null,
      userAgent: entry.userAgent?.slice(0, 400) ?? null,
    },
  });
}

export async function recordUsageEvent(
  prisma: PrismaClient,
  entry: {
    userId?: string | null;
    feature: UsageFeature;
    model?: string | null;
    tokensIn: number;
    tokensOut: number;
    durationMs: number;
    status: UsageStatus;
    errorCode?: string | null;
    route?: string | null;
  },
): Promise<void> {
  if (!prisma.usageEvent?.create) return;
  try {
    await prisma.usageEvent.create({
      data: {
        userId: entry.userId ?? null,
        feature: entry.feature,
        model: entry.model?.slice(0, 120) ?? null,
        tokensIn: Math.max(0, Math.round(entry.tokensIn)),
        tokensOut: Math.max(0, Math.round(entry.tokensOut)),
        costUsd: estimateCostUsd(entry.tokensIn, entry.tokensOut, entry.model),
        durationMs: Math.max(0, Math.round(entry.durationMs)),
        status: entry.status,
        errorCode: entry.errorCode?.slice(0, 80) ?? null,
        route: entry.route?.slice(0, 160) ?? null,
      },
    });
  } catch {
    // Non-fatal: usage telemetry must not break user requests.
  }
}

export async function recordActivityEvent(
  prisma: PrismaClient,
  entry: {
    userId: string;
    action: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  if (!prisma.activityEvent?.create) return;
  try {
    await prisma.activityEvent.create({
      data: {
        userId: entry.userId,
        action: entry.action.slice(0, 60),
        metadataJson: (entry.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    if (prisma.user?.update) {
      await prisma.user
        .update({
          where: { id: entry.userId },
          data: { lastActiveAt: new Date() },
        })
        .catch(() => undefined);
    }
  } catch {
    // Non-fatal
  }
}

export async function recordLoginHistory(
  prisma: PrismaClient,
  entry: {
    userId?: string | null;
    email: string;
    method: LoginMethod;
    success: boolean;
    ip?: string | null;
    userAgent?: string | null;
    suspicious?: boolean;
    reason?: string | null;
  },
): Promise<void> {
  if (!prisma.loginHistory?.create) return;
  try {
    await prisma.loginHistory.create({
      data: {
        userId: entry.userId ?? null,
        email: entry.email.slice(0, 255),
        method: entry.method,
        success: entry.success,
        ip: entry.ip?.slice(0, 64) ?? null,
        userAgent: entry.userAgent?.slice(0, 255) ?? null,
        suspicious: Boolean(entry.suspicious),
        reason: entry.reason?.slice(0, 255) ?? null,
      },
    });
  } catch {
    // Non-fatal
  }
}

export async function recordErrorLog(
  prisma: PrismaClient,
  entry: {
    route: string;
    method: string;
    statusCode: number;
    code: string;
    message: string;
    userId?: string | null;
    requestId?: string | null;
  },
): Promise<void> {
  if (!prisma.errorLog?.create) return;
  try {
    await prisma.errorLog.create({
      data: {
        route: entry.route.slice(0, 200),
        method: entry.method.slice(0, 12),
        statusCode: entry.statusCode,
        code: entry.code.slice(0, 80),
        message: entry.message.slice(0, 2000),
        userId: entry.userId ?? null,
        requestId: entry.requestId?.slice(0, 80) ?? null,
      },
    });
  } catch {
    // Non-fatal
  }
}

let cachedSettings: { value: AppSettings; expiresAt: number } | null = null;

export function invalidateAppSettingsCache(): void {
  cachedSettings = null;
}

export async function getAppSettings(prisma: PrismaClient): Promise<AppSettings> {
  if (cachedSettings && Date.now() < cachedSettings.expiresAt) {
    return cachedSettings.value;
  }
  const existing = await prisma.appSettings.findUnique({ where: { id: 'global' } });
  if (existing) {
    cachedSettings = { value: existing, expiresAt: Date.now() + 15_000 };
    return existing;
  }
  const created = await prisma.appSettings.create({
    data: { id: 'global' },
  });
  cachedSettings = { value: created, expiresAt: Date.now() + 15_000 };
  return created;
}

