-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "VocabKind" AS ENUM ('REPEATED', 'UPGRADE', 'GOOD_USAGE');

-- AlterTable
ALTER TABLE "conversation_sessions" ADD COLUMN     "analysisStatus" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "liveMetrics" JSONB,
ADD COLUMN     "userSpeakingMs" INTEGER;

-- CreateTable
CREATE TABLE "session_analyses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "skills" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "strengths" TEXT[],
    "focusAreas" TEXT[],
    "conversationSkills" JSONB NOT NULL,
    "translationPatterns" TEXT[],
    "feedbackLanguage" TEXT NOT NULL,
    "evalModel" TEXT NOT NULL,
    "evalPromptVersion" TEXT NOT NULL,
    "groundingDropped" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grammar_errors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analysisId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "turnSeq" INTEGER NOT NULL,
    "original" TEXT NOT NULL,
    "corrected" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grammar_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vocabulary_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analysisId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" "VocabKind" NOT NULL,
    "term" TEXT NOT NULL,
    "alternatives" TEXT[],
    "example" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vocabulary_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fluency_metrics" (
    "analysisId" UUID NOT NULL,
    "userSpeakingMs" INTEGER NOT NULL,
    "userTurns" INTEGER NOT NULL,
    "userWords" INTEGER NOT NULL,
    "wordsPerMinute" INTEGER,
    "meanUtteranceWords" DOUBLE PRECISION NOT NULL,
    "typeTokenRatio" DOUBLE PRECISION NOT NULL,
    "fillerCounts" JSONB NOT NULL,
    "fillersPerMinute" DOUBLE PRECISION,
    "latencyP50Ms" INTEGER,
    "latencyP90Ms" INTEGER,
    "longPauseCount" INTEGER NOT NULL,

    CONSTRAINT "fluency_metrics_pkey" PRIMARY KEY ("analysisId")
);

-- CreateTable
CREATE TABLE "practice_recommendations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "analysisId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "scenarioSlug" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "learning_profiles" (
    "userId" UUID NOT NULL,
    "grammarBand" DOUBLE PRECISION,
    "vocabularyBand" DOUBLE PRECISION,
    "fluencyBand" DOUBLE PRECISION,
    "conversationBand" DOUBLE PRECISION,
    "commonErrors" JSONB NOT NULL DEFAULT '[]',
    "commonFillers" JSONB NOT NULL DEFAULT '{}',
    "analysedCount" INTEGER NOT NULL DEFAULT 0,
    "totalSpeakingMs" BIGINT NOT NULL DEFAULT 0,
    "lastAnalysedSessionId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "learning_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "session_analyses_sessionId_key" ON "session_analyses"("sessionId");

-- CreateIndex
CREATE INDEX "grammar_errors_userId_category_idx" ON "grammar_errors"("userId", "category");

-- CreateIndex
CREATE INDEX "vocabulary_items_userId_kind_idx" ON "vocabulary_items"("userId", "kind");

-- AddForeignKey
ALTER TABLE "session_analyses" ADD CONSTRAINT "session_analyses_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "conversation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_errors" ADD CONSTRAINT "grammar_errors_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "session_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grammar_errors" ADD CONSTRAINT "grammar_errors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_items" ADD CONSTRAINT "vocabulary_items_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "session_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vocabulary_items" ADD CONSTRAINT "vocabulary_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fluency_metrics" ADD CONSTRAINT "fluency_metrics_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "session_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_recommendations" ADD CONSTRAINT "practice_recommendations_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "session_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "learning_profiles" ADD CONSTRAINT "learning_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
