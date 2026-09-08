-- CreateEnum
CREATE TYPE "MaterialDeliveryStockShortfallType" AS ENUM ('NORMAL', 'CORRECAO');

-- AlterTable
ALTER TABLE "material_deliveries" ADD COLUMN "contractId" TEXT;
ALTER TABLE "material_deliveries" ADD COLUMN "stockShortfallType" "MaterialDeliveryStockShortfallType";

ALTER TABLE "material_deliveries" DROP COLUMN IF EXISTS "contract";
ALTER TABLE "material_deliveries" DROP COLUMN IF EXISTS "stockShortfallNotes";

-- CreateIndex
CREATE INDEX "material_deliveries_contractId_idx" ON "material_deliveries"("contractId");

-- AddForeignKey
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
