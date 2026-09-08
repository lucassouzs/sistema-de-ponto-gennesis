-- CreateEnum
CREATE TYPE "StockShortfallStatus" AS ENUM ('ABERTO', 'RESOLVIDO');

-- CreateTable
CREATE TABLE "stock_shortfalls" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "costCenterId" TEXT,
    "constructionMaterialId" TEXT NOT NULL,
    "engineeringLabel" TEXT NOT NULL,
    "unit" TEXT,
    "orderedQty" DECIMAL(12,2) NOT NULL,
    "receivedQty" DECIMAL(12,2) NOT NULL,
    "gapQty" DECIMAL(12,2) NOT NULL,
    "status" "StockShortfallStatus" NOT NULL DEFAULT 'ABERTO',
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_shortfalls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_shortfalls_purchaseOrderId_constructionMaterialId_key" ON "stock_shortfalls"("purchaseOrderId", "constructionMaterialId");

-- CreateIndex
CREATE INDEX "stock_shortfalls_orderNumber_idx" ON "stock_shortfalls"("orderNumber");

-- CreateIndex
CREATE INDEX "stock_shortfalls_status_idx" ON "stock_shortfalls"("status");

-- CreateIndex
CREATE INDEX "stock_shortfalls_costCenterId_idx" ON "stock_shortfalls"("costCenterId");

-- AddForeignKey
ALTER TABLE "stock_shortfalls" ADD CONSTRAINT "stock_shortfalls_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_shortfalls" ADD CONSTRAINT "stock_shortfalls_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_shortfalls" ADD CONSTRAINT "stock_shortfalls_constructionMaterialId_fkey" FOREIGN KEY ("constructionMaterialId") REFERENCES "construction_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_shortfalls" ADD CONSTRAINT "stock_shortfalls_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
