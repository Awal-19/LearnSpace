DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReviewRating') THEN
    CREATE TYPE "ReviewRating" AS ENUM ('again', 'hard', 'good', 'easy');
  END IF;
END$$;

-- Link AI flashcard decks to Documents directly
ALTER TABLE "decks"
  ADD COLUMN IF NOT EXISTS "documentId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'decks_documentId_fkey'
  ) THEN
    ALTER TABLE "decks"
      ADD CONSTRAINT "decks_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "documents"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS "decks_userId_documentId_idx" ON "decks"("userId", "documentId");

-- SM-2 scheduling state + optional card image + topic on cards
ALTER TABLE "cards"
  ADD COLUMN IF NOT EXISTS "topic" VARCHAR(160),
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "imageStorageKey" TEXT,
  ADD COLUMN IF NOT EXISTS "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
  ADD COLUMN IF NOT EXISTS "intervalDays" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "repetitions" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lapses" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "dueAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "lastReviewedAt" TIMESTAMPTZ(3);

ALTER TABLE "cards" DROP CONSTRAINT IF EXISTS "cards_easeFactor_check";
ALTER TABLE "cards" ADD CONSTRAINT "cards_easeFactor_check"
  CHECK ("easeFactor" >= 1.3);

ALTER TABLE "cards" DROP CONSTRAINT IF EXISTS "cards_intervalDays_check";
ALTER TABLE "cards" ADD CONSTRAINT "cards_intervalDays_check"
  CHECK ("intervalDays" >= 0);

ALTER TABLE "cards" DROP CONSTRAINT IF EXISTS "cards_repetitions_check";
ALTER TABLE "cards" ADD CONSTRAINT "cards_repetitions_check"
  CHECK ("repetitions" >= 0);

ALTER TABLE "cards" DROP CONSTRAINT IF EXISTS "cards_lapses_check";
ALTER TABLE "cards" ADD CONSTRAINT "cards_lapses_check"
  CHECK ("lapses" >= 0);

CREATE INDEX IF NOT EXISTS "cards_deckId_dueAt_idx" ON "cards"("deckId", "dueAt");

-- Review logs for spaced-repetition analytics
CREATE TABLE IF NOT EXISTS "review_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "cardId" UUID NOT NULL,
  "deckId" UUID NOT NULL,
  "courseId" UUID,
  "topic" VARCHAR(160),
  "rating" "ReviewRating" NOT NULL,
  "quality" SMALLINT NOT NULL,
  "previousInterval" INTEGER NOT NULL,
  "nextInterval" INTEGER NOT NULL,
  "easeFactorAfter" DOUBLE PRECISION NOT NULL,
  "reviewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "review_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "review_logs_quality_check" CHECK ("quality" BETWEEN 1 AND 4),
  CONSTRAINT "review_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_logs_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_logs_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "review_logs_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "review_logs_userId_reviewedAt_idx" ON "review_logs"("userId", "reviewedAt" DESC);
CREATE INDEX IF NOT EXISTS "review_logs_deckId_reviewedAt_idx" ON "review_logs"("deckId", "reviewedAt" DESC);
CREATE INDEX IF NOT EXISTS "review_logs_userId_courseId_reviewedAt_idx" ON "review_logs"("userId", "courseId", "reviewedAt" DESC);
CREATE INDEX IF NOT EXISTS "review_logs_cardId_reviewedAt_idx" ON "review_logs"("cardId", "reviewedAt" DESC);

