-- AlterTable
ALTER TABLE "conversation_sessions" ADD COLUMN     "accent" TEXT NOT NULL DEFAULT 'INDIAN',
ADD COLUMN     "recordingBytes" INTEGER,
ADD COLUMN     "recordingDurationMs" INTEGER,
ADD COLUMN     "recordingKey" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'FREE';
