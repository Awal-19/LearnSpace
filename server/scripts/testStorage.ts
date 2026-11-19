import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { loadEnv } from '../src/config/env';
import { createLogger } from '../src/lib/logger';
import { createPrismaClient } from '../src/lib/prisma';
import { createStorageService } from '../src/lib/storage';

async function main() {
  const env = loadEnv();
  const logger = createLogger(env);
  const prisma = createPrismaClient(env.DATABASE_URL);
  const storage = createStorageService(env, logger, prisma);

  if (!storage.isConfigured()) {
    console.error('Storage test FAILED: storage.isConfigured() is false.');
    process.exit(1);
  }

  const testUserId = randomUUID();
  const payload = Buffer.from(`learnspace-storage-smoke-test-${Date.now()}`, 'utf8');
  console.log(
    `Uploading smoke-test object via ${env.CLOUDINARY_URL ? 'Cloudinary' : 'PostgreSQL StoredBlob'}...`,
  );
  const uploaded = await storage.uploadAttachment(payload, testUserId, 'document', 'txt');
  console.log('Uploaded:', uploaded.storageKey);

  const fetched = await storage.readAttachmentBytes(
    uploaded.storageKey,
    uploaded.storageUrl,
    'document',
  );
  if (!fetched.equals(payload)) {
    throw new Error('Downloaded bytes did not match uploaded payload');
  }
  console.log('Verified round-trip byte integrity.');

  await storage.deleteAttachment(uploaded.storageKey, 'document');
  console.log('Cleaned up test object. Storage test PASSED.');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Storage test FAILED:', err);
  process.exit(1);
});
