-- AlterTable
ALTER TABLE "contract_annual_values" ADD COLUMN "budgetAdjustmentDelta" DECIMAL(15,2),
ADD COLUMN "budgetAdjustmentEffectiveDate" TIMESTAMP(3);
