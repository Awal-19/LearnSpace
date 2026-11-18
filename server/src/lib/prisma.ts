import { PrismaClient } from '@prisma/client';

/** Creates a PrismaClient configured for the validated runtime DATABASE_URL. */
export function createPrismaClient(databaseUrl?: string): PrismaClient {
  return new PrismaClient({
    log: ['warn', 'error'],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  });
}
