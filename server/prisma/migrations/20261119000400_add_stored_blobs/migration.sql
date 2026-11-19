-- CreateTable
CREATE TABLE "stored_blobs" (
    "key" VARCHAR(255) NOT NULL,
    "userId" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_blobs_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "stored_blobs_userId_idx" ON "stored_blobs"("userId");

