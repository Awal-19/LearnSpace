CREATE TABLE "email_delivery_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "recipientEmail" VARCHAR(255) NOT NULL,
  "kind" VARCHAR(40) NOT NULL,
  "provider" VARCHAR(30) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "providerMessageId" VARCHAR(180),
  "errorMessage" VARCHAR(500),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_delivery_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_delivery_logs_recipientEmail_createdAt_idx" ON "email_delivery_logs"("recipientEmail", "createdAt" DESC);
CREATE INDEX "email_delivery_logs_status_createdAt_idx" ON "email_delivery_logs"("status", "createdAt" DESC);

