import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';
import type { StorageService } from '../../lib/storage';

export interface CollectedUserAssets {
  avatarPublicId: string | null;
  attachments: Array<{ storageKey: string; kind: 'image' | 'document' }>;
  documents: Array<{ storageKey: string; kind: 'image' | 'document' }>;
  cardImageKeys: string[];
}

/**
 * Snapshot all external/local storage keys owned by a user before cascading DB deletion removes the rows.
 */
export async function collectUserStorageAssets(
  prisma: PrismaClient,
  userId: string,
  avatarPublicId: string | null,
): Promise<CollectedUserAssets> {
  const [attachments, documents, cards] = await Promise.all([
    prisma.messageAttachment?.findMany
      ? prisma.messageAttachment.findMany({
          where: { userId },
          select: { storageKey: true, kind: true },
        })
      : Promise.resolve([]),
    prisma.document?.findMany
      ? prisma.document.findMany({
          where: { userId },
          select: { storageKey: true, kind: true },
        })
      : Promise.resolve([]),
    prisma.card?.findMany
      ? prisma.card.findMany({
          where: { deck: { userId }, imageStorageKey: { not: null } },
          select: { imageStorageKey: true },
        })
      : Promise.resolve([]),
  ]);

  return {
    avatarPublicId,
    attachments,
    documents,
    cardImageKeys: cards.map((c) => c.imageStorageKey).filter((key): key is string => Boolean(key)),
  };
}

/**
 * Anonymizes PII (`email`, `ip`, `userAgent`) from login_history after account deletion.
 */
export async function scrubDeletedUserLoginHistory(
  prisma: PrismaClient,
  logger: Logger,
  userId: string,
  email: string,
): Promise<void> {
  if (!prisma.loginHistory?.updateMany) return;
  await prisma.loginHistory
    .updateMany({
      where: { OR: [{ userId }, { email }] },
      data: { userId: null, email: '[deleted]', ip: null, userAgent: null },
    })
    .catch((err) => {
      logger.warn({ err, userId }, 'Failed to scrub deleted user login history');
    });
}

/**
 * Best-effort cleanup of all collected binary assets (avatar, chat attachments, documents, card images).
 */
export async function deleteCollectedUserStorageAssets(
  storage: StorageService,
  logger: Logger,
  userId: string,
  assets: CollectedUserAssets,
): Promise<void> {
  const ops: Array<Promise<void>> = [];

  if (assets.avatarPublicId) {
    ops.push(
      storage.deleteAvatar(assets.avatarPublicId).catch((err) => {
        logger.warn({ err, userId }, 'Failed to delete user avatar during account deletion');
      }),
    );
  }
  for (const att of assets.attachments) {
    ops.push(
      storage.deleteAttachment(att.storageKey, att.kind).catch((err) => {
        logger.warn(
          { err, userId, storageKey: att.storageKey },
          'Failed to delete chat attachment',
        );
      }),
    );
  }
  for (const doc of assets.documents) {
    ops.push(
      storage.deleteAttachment(doc.storageKey, doc.kind).catch((err) => {
        logger.warn({ err, userId, storageKey: doc.storageKey }, 'Failed to delete study document');
      }),
    );
  }
  for (const key of assets.cardImageKeys) {
    ops.push(
      storage.deleteAttachment(key, 'image').catch((err) => {
        logger.warn({ err, userId, storageKey: key }, 'Failed to delete flashcard image');
      }),
    );
  }

  await Promise.allSettled(ops);
}
