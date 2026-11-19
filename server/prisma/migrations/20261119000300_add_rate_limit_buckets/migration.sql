-- CreateTable
CREATE TABLE "rate_limit_buckets" (
    "key" VARCHAR(255) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_limit_buckets_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "rate_limit_buckets_resetAt_idx" ON "rate_limit_buckets"("resetAt");

