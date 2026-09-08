-- Entrega vinculada à movimentação de estoque + tipo de recebimento

CREATE TYPE "MaterialDeliveryReceiptType" AS ENUM ('TOTAL', 'PARCIAL');

ALTER TABLE "material_deliveries" ADD COLUMN "stockMovementId" TEXT;
ALTER TABLE "material_deliveries" ADD COLUMN "receiptType" "MaterialDeliveryReceiptType";

ALTER TABLE "material_requests" ADD COLUMN "lastStockReceiptType" "MaterialDeliveryReceiptType";

CREATE UNIQUE INDEX "material_deliveries_stockMovementId_key" ON "material_deliveries"("stockMovementId");
CREATE INDEX "material_deliveries_stockMovementId_idx" ON "material_deliveries"("stockMovementId");
CREATE INDEX "material_deliveries_receiptType_idx" ON "material_deliveries"("receiptType");

ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
