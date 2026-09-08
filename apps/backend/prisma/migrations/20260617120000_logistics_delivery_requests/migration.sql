-- CreateEnum
CREATE TYPE "LogisticsDeliveryUrgency" AS ENUM ('NORMAL', 'URGENT');

-- CreateTable
CREATE TABLE "logistics_delivery_requests" (
    "id" TEXT NOT NULL,
    "displayNumber" INTEGER NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "urgency" "LogisticsDeliveryUrgency" NOT NULL DEFAULT 'NORMAL',
    "contractId" TEXT,
    "costCenterId" TEXT,
    "serviceOrderId" TEXT,
    "serviceOrderNumber" TEXT,
    "purchaseOrderId" TEXT,
    "movementId" TEXT NOT NULL,
    "supplierId" TEXT,
    "driverName" TEXT,
    "materialId" TEXT,
    "materialName" TEXT,
    "materialAttachmentUrl" TEXT,
    "materialAttachmentName" TEXT,
    "value" DECIMAL(15,2) NOT NULL,
    "history" TEXT,
    "observations" TEXT,
    "expectedDelivery" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_delivery_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "logistics_delivery_requests_displayNumber_key" ON "logistics_delivery_requests"("displayNumber");

-- CreateIndex
CREATE INDEX "logistics_delivery_requests_createdBy_idx" ON "logistics_delivery_requests"("createdBy");

-- CreateIndex
CREATE INDEX "logistics_delivery_requests_contractId_idx" ON "logistics_delivery_requests"("contractId");

-- CreateIndex
CREATE INDEX "logistics_delivery_requests_costCenterId_idx" ON "logistics_delivery_requests"("costCenterId");

-- CreateIndex
CREATE INDEX "logistics_delivery_requests_purchaseOrderId_idx" ON "logistics_delivery_requests"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "logistics_delivery_requests_supplierId_idx" ON "logistics_delivery_requests"("supplierId");

-- CreateIndex
CREATE INDEX "logistics_delivery_requests_requestedAt_idx" ON "logistics_delivery_requests"("requestedAt");

-- AddForeignKey
ALTER TABLE "logistics_delivery_requests" ADD CONSTRAINT "logistics_delivery_requests_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_delivery_requests" ADD CONSTRAINT "logistics_delivery_requests_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_delivery_requests" ADD CONSTRAINT "logistics_delivery_requests_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_delivery_requests" ADD CONSTRAINT "logistics_delivery_requests_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_delivery_requests" ADD CONSTRAINT "logistics_delivery_requests_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
