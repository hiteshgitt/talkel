-- AlterTable
ALTER TABLE "session_analyses" ADD COLUMN     "remembered" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "memoryConsentAt" TIMESTAMPTZ(3),
ADD COLUMN     "memoryEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "user_memories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceSessionId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_memories_userId_updatedAt_idx" ON "user_memories"("userId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "user_memories" ADD CONSTRAINT "user_memories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
