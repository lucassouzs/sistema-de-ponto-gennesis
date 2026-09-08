-- CreateEnum
CREATE TYPE "DemandSheetPurchaseStatus" AS ENUM (
  'WAREHOUSE_DF',
  'WAREHOUSE_GO',
  'FULLY_FULFILLED_BY_STOCK',
  'PARTIALLY_FULFILLED_BY_STOCK',
  'PURCHASE_REQUEST',
  'SUPPLIES',
  'FINISHED'
);

-- AlterTable
ALTER TABLE "demand_sheet_approvals"
  ADD COLUMN "purchaseStatus" "DemandSheetPurchaseStatus",
  ADD COLUMN "purchaseStatusUpdatedBy" TEXT,
  ADD COLUMN "purchaseStatusUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "demand_sheet_approvals_purchaseStatus_idx" ON "demand_sheet_approvals"("purchaseStatus");

-- AddForeignKey
ALTER TABLE "demand_sheet_approvals"
  ADD CONSTRAINT "demand_sheet_approvals_purchaseStatusUpdatedBy_fkey"
  FOREIGN KEY ("purchaseStatusUpdatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
