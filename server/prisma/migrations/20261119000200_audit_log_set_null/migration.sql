ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_actorId_fkey";
ALTER TABLE "audit_logs" ALTER COLUMN "actorId" DROP NOT NULL;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

