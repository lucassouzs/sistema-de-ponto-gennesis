-- CreateTable
CREATE TABLE IF NOT EXISTS "user_restricted_dp_approval_cost_centers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_restricted_dp_approval_cost_centers_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "position_permission_templates" ADD COLUMN IF NOT EXISTS "restrictedDpApprovalCostCenterIds" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_restricted_dp_approval_cost_centers_userId_costCenterId_key"
  ON "user_restricted_dp_approval_cost_centers"("userId", "costCenterId");

CREATE INDEX IF NOT EXISTS "user_restricted_dp_approval_cost_centers_userId_idx"
  ON "user_restricted_dp_approval_cost_centers"("userId");

CREATE INDEX IF NOT EXISTS "user_restricted_dp_approval_cost_centers_costCenterId_idx"
  ON "user_restricted_dp_approval_cost_centers"("costCenterId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_restricted_dp_approval_cost_centers_userId_fkey'
  ) THEN
    ALTER TABLE "user_restricted_dp_approval_cost_centers"
      ADD CONSTRAINT "user_restricted_dp_approval_cost_centers_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_restricted_dp_approval_cost_centers_costCenterId_fkey'
  ) THEN
    ALTER TABLE "user_restricted_dp_approval_cost_centers"
      ADD CONSTRAINT "user_restricted_dp_approval_cost_centers_costCenterId_fkey"
      FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_restricted_dp_approval_cost_centers_updatedBy_fkey'
  ) THEN
    ALTER TABLE "user_restricted_dp_approval_cost_centers"
      ADD CONSTRAINT "user_restricted_dp_approval_cost_centers_updatedBy_fkey"
      FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
