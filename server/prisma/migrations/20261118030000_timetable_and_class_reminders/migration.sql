-- Extend notification types and user settings for class reminders
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'class_reminder';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TimetableEntryType') THEN
    CREATE TYPE "TimetableEntryType" AS ENUM ('lecture', 'lab', 'tutorial', 'seminar');
  END IF;
END$$;

ALTER TABLE "user_settings"
  ADD COLUMN IF NOT EXISTS "classReminderMinutes" INTEGER NOT NULL DEFAULT 15;

ALTER TABLE "user_settings" DROP CONSTRAINT IF EXISTS "user_settings_classReminderMinutes_check";
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_classReminderMinutes_check"
  CHECK ("classReminderMinutes" >= 0 AND "classReminderMinutes" <= 1440);

-- Weekly timetable slots tied to user courses
CREATE TABLE IF NOT EXISTS "timetable_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "courseId" UUID NOT NULL,
  "dayOfWeek" SMALLINT NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "venue" VARCHAR(120),
  "type" "TimetableEntryType" NOT NULL DEFAULT 'lecture',
  "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
  "reminderMinutes" INTEGER,
  "lastReminderKey" VARCHAR(160),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "timetable_entries_dayOfWeek_check" CHECK ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6),
  CONSTRAINT "timetable_entries_startMinute_check" CHECK ("startMinute" >= 0 AND "startMinute" < 1440),
  CONSTRAINT "timetable_entries_endMinute_check" CHECK ("endMinute" > "startMinute" AND "endMinute" <= 1440),
  CONSTRAINT "timetable_entries_reminderMinutes_check" CHECK ("reminderMinutes" IS NULL OR ("reminderMinutes" >= 0 AND "reminderMinutes" <= 1440)),
  CONSTRAINT "timetable_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "timetable_entries_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "timetable_entries_userId_dayOfWeek_startMinute_idx"
  ON "timetable_entries"("userId", "dayOfWeek", "startMinute");
CREATE INDEX IF NOT EXISTS "timetable_entries_userId_courseId_idx"
  ON "timetable_entries"("userId", "courseId");

-- Deduplicated occurrence linkage on notifications
ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "timetableEntryId" UUID,
  ADD COLUMN IF NOT EXISTS "occurrenceKey" VARCHAR(160);

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_timetableEntryId_fkey";
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_timetableEntryId_fkey"
  FOREIGN KEY ("timetableEntryId") REFERENCES "timetable_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "notifications_timetableEntryId_idx"
  ON "notifications"("timetableEntryId");
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_userId_type_occurrenceKey_key"
  ON "notifications"("userId", "type", "occurrenceKey");

