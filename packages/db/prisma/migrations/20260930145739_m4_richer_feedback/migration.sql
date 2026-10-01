-- AlterTable
ALTER TABLE "session_analyses" ADD COLUMN     "conversationMoments" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "phrasing" JSONB NOT NULL DEFAULT '[]';
