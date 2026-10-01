-- CreateEnum
CREATE TYPE "ScenarioType" AS ENUM ('PRACTICE', 'MISSION');

-- AlterTable
ALTER TABLE "conversation_sessions" ADD COLUMN     "missionLevel" INTEGER;

-- AlterTable
ALTER TABLE "scenario_versions" ADD COLUMN     "mission" JSONB;

-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN     "type" "ScenarioType" NOT NULL DEFAULT 'PRACTICE';

-- AlterTable
ALTER TABLE "session_analyses" ADD COLUMN     "missionResult" JSONB;

-- CreateTable
CREATE TABLE "mission_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "unlockedLevel" INTEGER NOT NULL DEFAULT 1,
    "passedLevels" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "bestScores" JSONB NOT NULL DEFAULT '{}',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "mission_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mission_progress_userId_scenarioId_key" ON "mission_progress"("userId", "scenarioId");

-- AddForeignKey
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_progress" ADD CONSTRAINT "mission_progress_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
