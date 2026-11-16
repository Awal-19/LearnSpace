-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('past_question', 'slides', 'notes');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('uploaded', 'extracting', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "DocumentJobKind" AS ENUM ('extract', 'detect_questions', 'generate_set');

-- CreateEnum
CREATE TYPE "DocumentJobStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "AnswerMode" AS ENUM ('full_worked', 'answers_only', 'marking_scheme');

-- CreateEnum
CREATE TYPE "ExtractedQuestionStatus" AS ENUM ('pending', 'answering', 'answered', 'error');

-- CreateEnum
CREATE TYPE "GeneratedQuestionType" AS ENUM ('mcq', 'true_false', 'short_answer', 'essay', 'fill_blank', 'calculation', 'flashcard');

-- CreateEnum
CREATE TYPE "QuestionDifficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "courseId" UUID,
    "title" VARCHAR(200) NOT NULL,
    "type" "DocumentType" NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(120) NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "storageUrl" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL DEFAULT '',
    "pagesJson" JSONB NOT NULL DEFAULT '[]',
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "status" "DocumentStatus" NOT NULL DEFAULT 'uploaded',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "documentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "DocumentJobKind" NOT NULL,
    "status" "DocumentJobStatus" NOT NULL DEFAULT 'queued',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extracted_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "documentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "section" VARCHAR(120),
    "questionNumber" VARCHAR(40) NOT NULL,
    "prompt" TEXT NOT NULL,
    "marks" SMALLINT,
    "instructions" TEXT,
    "unclear" BOOLEAN NOT NULL DEFAULT false,
    "unclearReason" TEXT,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "answerMode" "AnswerMode" NOT NULL DEFAULT 'full_worked',
    "answerMarkdown" TEXT,
    "thinkingMarkdown" TEXT,
    "citedSourcesJson" JSONB,
    "status" "ExtractedQuestionStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "extracted_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_question_sets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "documentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "settingsJson" JSONB NOT NULL,
    "quizId" UUID,
    "deckId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_question_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_questions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "setId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "GeneratedQuestionType" NOT NULL,
    "difficulty" "QuestionDifficulty" NOT NULL,
    "topic" VARCHAR(160) NOT NULL,
    "prompt" TEXT NOT NULL,
    "optionsJson" JSONB,
    "correctAnswer" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "sourceRef" VARCHAR(120) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generated_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_practice_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "setId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "answersJson" JSONB NOT NULL,
    "score" SMALLINT NOT NULL,
    "total" SMALLINT NOT NULL,
    "weakTopicsJson" JSONB NOT NULL DEFAULT '[]',
    "feedbackJson" JSONB NOT NULL DEFAULT '[]',
    "takenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_practice_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_userId_createdAt_idx" ON "documents"("userId", "createdAt" DESC);
CREATE INDEX "documents_userId_type_idx" ON "documents"("userId", "type");
CREATE INDEX "documents_userId_courseId_idx" ON "documents"("userId", "courseId");

-- CreateIndex
CREATE INDEX "document_jobs_status_runAt_idx" ON "document_jobs"("status", "runAt");
CREATE INDEX "document_jobs_documentId_createdAt_idx" ON "document_jobs"("documentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "extracted_questions_documentId_position_idx" ON "extracted_questions"("documentId", "position");
CREATE INDEX "extracted_questions_userId_idx" ON "extracted_questions"("userId");

-- CreateIndex
CREATE INDEX "generated_question_sets_documentId_createdAt_idx" ON "generated_question_sets"("documentId", "createdAt" DESC);
CREATE INDEX "generated_question_sets_userId_createdAt_idx" ON "generated_question_sets"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "generated_questions_setId_position_idx" ON "generated_questions"("setId", "position");

-- CreateIndex
CREATE INDEX "document_practice_attempts_setId_takenAt_idx" ON "document_practice_attempts"("setId", "takenAt" DESC);
CREATE INDEX "document_practice_attempts_userId_takenAt_idx" ON "document_practice_attempts"("userId", "takenAt" DESC);

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_jobs" ADD CONSTRAINT "document_jobs_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_jobs" ADD CONSTRAINT "document_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "extracted_questions" ADD CONSTRAINT "extracted_questions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extracted_questions" ADD CONSTRAINT "extracted_questions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_question_sets" ADD CONSTRAINT "generated_question_sets_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generated_question_sets" ADD CONSTRAINT "generated_question_sets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "generated_question_sets" ADD CONSTRAINT "generated_question_sets_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "quizzes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "generated_question_sets" ADD CONSTRAINT "generated_question_sets_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "decks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_questions" ADD CONSTRAINT "generated_questions_setId_fkey" FOREIGN KEY ("setId") REFERENCES "generated_question_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_practice_attempts" ADD CONSTRAINT "document_practice_attempts_setId_fkey" FOREIGN KEY ("setId") REFERENCES "generated_question_sets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "document_practice_attempts" ADD CONSTRAINT "document_practice_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

