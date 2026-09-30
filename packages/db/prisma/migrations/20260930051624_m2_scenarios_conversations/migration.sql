-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('CREATED', 'CONNECTING', 'ACTIVE', 'RECONNECTING', 'ENDED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EndReason" AS ENUM ('USER_ENDED', 'TIME_LIMIT', 'OBJECTIVE_COMPLETED', 'AI_NATURAL_END', 'CONNECTION_LOST', 'PROVIDER_CLOSED', 'QUOTA_EXHAUSTED', 'SERVER_RESTART', 'ERROR');

-- CreateEnum
CREATE TYPE "Speaker" AS ENUM ('USER', 'AI');

-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('REALTIME', 'EVALUATION', 'TRANSCRIPTION');

-- CreateTable
CREATE TABLE "scenario_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "scenario_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedVersionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scenarioId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "tagline" TEXT NOT NULL,
    "briefing" TEXT NOT NULL,
    "userRole" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "minLevel" "EnglishLevel" NOT NULL DEFAULT 'BEGINNER',
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 5,
    "promptTemplate" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "goals" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "scenario_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "VoiceGender" NOT NULL,
    "voices" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "promptFragment" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "scenarioVersionId" UUID NOT NULL,
    "personaId" UUID NOT NULL,
    "difficulty" "EnglishLevel" NOT NULL,
    "liveCorrection" BOOLEAN NOT NULL DEFAULT false,
    "plannedDurationSec" INTEGER NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'CREATED',
    "endReason" "EndReason",
    "startedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "durationMs" INTEGER,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersions" JSONB NOT NULL,
    "instructionsHash" TEXT NOT NULL,
    "scenarioState" JSONB NOT NULL,
    "goalsAchieved" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversation_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_turns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sessionId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "speaker" "Speaker" NOT NULL,
    "text" TEXT NOT NULL,
    "startMs" INTEGER NOT NULL,
    "interrupted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_turns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_events" (
    "id" BIGSERIAL NOT NULL,
    "sessionId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "atMs" INTEGER NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "sessionId" UUID,
    "kind" "UsageKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "billableSeconds" INTEGER NOT NULL DEFAULT 0,
    "inputAudioTokens" INTEGER NOT NULL DEFAULT 0,
    "outputAudioTokens" INTEGER NOT NULL DEFAULT 0,
    "inputTextTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTextTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scenario_categories_slug_key" ON "scenario_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "scenarios_slug_key" ON "scenarios"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "scenarios_publishedVersionId_key" ON "scenarios"("publishedVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "scenario_versions_scenarioId_version_key" ON "scenario_versions"("scenarioId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "personas_slug_key" ON "personas"("slug");

-- CreateIndex
CREATE INDEX "conversation_sessions_userId_createdAt_idx" ON "conversation_sessions"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "conversation_sessions_status_idx" ON "conversation_sessions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_turns_sessionId_seq_key" ON "conversation_turns"("sessionId", "seq");

-- CreateIndex
CREATE INDEX "conversation_events_sessionId_atMs_idx" ON "conversation_events"("sessionId", "atMs");

-- CreateIndex
CREATE INDEX "usage_records_userId_createdAt_idx" ON "usage_records"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "scenario_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_publishedVersionId_fkey" FOREIGN KEY ("publishedVersionId") REFERENCES "scenario_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_versions" ADD CONSTRAINT "scenario_versions_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_scenarioVersionId_fkey" FOREIGN KEY ("scenarioVersionId") REFERENCES "scenario_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_personaId_fkey" FOREIGN KEY ("personaId") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_turns" ADD CONSTRAINT "conversation_turns_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "conversation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "conversation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "conversation_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
