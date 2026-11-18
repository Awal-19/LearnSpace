import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { estimateCostUsd } from '../src/modules/admin/admin.logging';

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!adminEmail) {
    console.error(
      'ERROR: Set ADMIN_EMAIL in server/.env (or environment) before running admin:seed.',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: 'super_admin', status: 'active', emailVerified: true },
      });
      console.log(`Promoted existing user "${adminEmail}" to super_admin.`);
    } else {
      const name = adminEmail.split('@')[0]?.slice(0, 100) || 'Admin';
      await prisma.user.create({
        data: {
          email: adminEmail,
          name,
          role: 'super_admin',
          status: 'active',
          emailVerified: true,
          passwordHash: null,
          settings: { create: { timezone: 'UTC' } },
        },
      });
      console.log(
        `Created super_admin "${adminEmail}" (no default password). Sign in with Google or use "Forgot password" on /login to set a password.`,
      );
    }

    // Ensure global settings row exists
    await prisma.appSettings.upsert({
      where: { id: 'global' },
      create: { id: 'global' },
      update: {},
    });

    // Idempotent backfill of usage_events from existing assistant messages
    const existingUsageCount = await prisma.usageEvent.count();
    if (existingUsageCount === 0) {
      const assistantMessages = await prisma.message.findMany({
        where: { role: 'assistant' },
        select: {
          userId: true,
          inputTokens: true,
          outputTokens: true,
          model: true,
          status: true,
          createdAt: true,
        },
        take: 2000,
      });
      if (assistantMessages.length > 0) {
        await prisma.usageEvent.createMany({
          data: assistantMessages.map((m) => ({
            userId: m.userId,
            feature: 'chat',
            model: m.model,
            tokensIn: m.inputTokens ?? 0,
            tokensOut: m.outputTokens ?? 0,
            costUsd: estimateCostUsd(m.inputTokens ?? 0, m.outputTokens ?? 0, m.model),
            durationMs: 0,
            status: m.status === 'error' ? 'error' : 'success',
            createdAt: m.createdAt,
          })),
        });
        console.log(`Backfilled ${assistantMessages.length} usage_events from existing messages.`);
      }
    }

    // Idempotent backfill of activity_events from existing users/notes/quizzes
    const existingActivityCount = await prisma.activityEvent.count();
    if (existingActivityCount === 0) {
      const [users, notes, docs, attempts] = await Promise.all([
        prisma.user.findMany({ select: { id: true, createdAt: true }, take: 1000 }),
        prisma.note.findMany({ select: { userId: true, id: true, createdAt: true }, take: 1000 }),
        prisma.document.findMany({
          select: { userId: true, id: true, createdAt: true },
          take: 1000,
        }),
        prisma.quizAttempt.findMany({
          select: { userId: true, quizId: true, takenAt: true },
          take: 1000,
        }),
      ]);
      const rows = [
        ...users.map((u) => ({
          userId: u.id,
          action: 'signup',
          metadataJson: {},
          createdAt: u.createdAt,
        })),
        ...notes.map((n) => ({
          userId: n.userId,
          action: 'note',
          metadataJson: { noteId: n.id },
          createdAt: n.createdAt,
        })),
        ...docs.map((d) => ({
          userId: d.userId,
          action: 'document',
          metadataJson: { documentId: d.id },
          createdAt: d.createdAt,
        })),
        ...attempts.map((a) => ({
          userId: a.userId,
          action: 'quiz',
          metadataJson: { quizId: a.quizId },
          createdAt: a.takenAt,
        })),
      ];
      if (rows.length > 0) {
        await prisma.activityEvent.createMany({ data: rows });
        console.log(`Backfilled ${rows.length} activity_events.`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
