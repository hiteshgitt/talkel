-- AlterTable
ALTER TABLE "conversation_sessions" ADD COLUMN     "replayContext" JSONB,
ADD COLUMN     "replayOfId" UUID,
ADD COLUMN     "replayResult" JSONB,
ADD COLUMN     "replayTurnSeq" INTEGER;

-- AddForeignKey
ALTER TABLE "conversation_sessions" ADD CONSTRAINT "conversation_sessions_replayOfId_fkey" FOREIGN KEY ("replayOfId") REFERENCES "conversation_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
