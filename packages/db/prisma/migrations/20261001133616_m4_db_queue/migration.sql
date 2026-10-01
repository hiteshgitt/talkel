-- AlterTable
ALTER TABLE "conversation_sessions" ADD COLUMN     "analysisAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "analysisLockedUntil" TIMESTAMPTZ(3),
ADD COLUMN     "analysisNextAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "conversation_sessions_analysisNextAt_idx" ON "conversation_sessions"("analysisNextAt");
