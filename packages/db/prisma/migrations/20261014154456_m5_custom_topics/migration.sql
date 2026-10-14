-- AlterEnum
ALTER TYPE "UsageKind" ADD VALUE 'TOPIC';

-- DropForeignKey
ALTER TABLE "scenario_versions" DROP CONSTRAINT "scenario_versions_scenarioId_fkey";

-- AlterTable
ALTER TABLE "scenarios" ADD COLUMN     "ownerId" UUID;

-- CreateIndex
CREATE INDEX "scenarios_ownerId_idx" ON "scenarios"("ownerId");

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_versions" ADD CONSTRAINT "scenario_versions_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
