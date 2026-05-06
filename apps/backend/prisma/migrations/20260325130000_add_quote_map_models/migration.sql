-- CreateEnum
CREATE TYPE "QuoteMapStatus" AS ENUM ('DRAFT');

-- CreateTable
CREATE TABLE "quote_maps" (
    "id" TEXT NOT NULL,
    "materialRequestId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "status" "QuoteMapStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_maps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_map_suppliers" (
    "id" TEXT NOT NULL,
    "quoteMapId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "freight" DECIMAL(12,2),
    "paymentType" TEXT,
    "paymentCondition" TEXT,
    "paymentDetails" TEXT,
    "observations" TEXT,
    "amountToPay" DECIMAL(15,2),
    "boletoAttachmentUrl" TEXT,
    "boletoAttachmentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_map_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_map_supplier_items" (
    "id" TEXT NOT NULL,
    "quoteMapId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "materialRequestItemId" TEXT NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_map_supplier_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_map_winner_items" (
    "id" TEXT NOT NULL,
    "quoteMapId" TEXT NOT NULL,
    "materialRequestItemId" TEXT NOT NULL,
    "winnerSupplierId" TEXT NOT NULL,
    "winnerScore" DECIMAL(15,2) NOT NULL,
    "winnerUnitPrice" DECIMAL(12,2) NOT NULL,
    "freight" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_map_winner_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quote_map_suppliers_quoteMapId_supplierId_key" ON "quote_map_suppliers"("quoteMapId","supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "quote_map_supplier_items_quoteMapId_supplierId_materialRequestItemId_key" ON "quote_map_supplier_items"("quoteMapId","supplierId","materialRequestItemId");

-- CreateIndex
CREATE UNIQUE INDEX "quote_map_winner_items_quoteMapId_materialRequestItemId_key" ON "quote_map_winner_items"("quoteMapId","materialRequestItemId");

-- CreateIndex
CREATE INDEX "quote_maps_materialRequestId_idx" ON "quote_maps"("materialRequestId");

-- CreateIndex
CREATE INDEX "quote_maps_createdBy_idx" ON "quote_maps"("createdBy");

-- CreateIndex
CREATE INDEX "quote_map_suppliers_quoteMapId_idx" ON "quote_map_suppliers"("quoteMapId");

-- CreateIndex
CREATE INDEX "quote_map_supplier_items_quoteMapId_idx" ON "quote_map_supplier_items"("quoteMapId");

-- CreateIndex
CREATE INDEX "quote_map_supplier_items_materialRequestItemId_idx" ON "quote_map_supplier_items"("materialRequestItemId");

-- CreateIndex
CREATE INDEX "quote_map_winner_items_quoteMapId_idx" ON "quote_map_winner_items"("quoteMapId");

-- CreateIndex
CREATE INDEX "quote_map_winner_items_winnerSupplierId_idx" ON "quote_map_winner_items"("winnerSupplierId");

-- AddForeignKey
ALTER TABLE "quote_maps" ADD CONSTRAINT "quote_maps_materialRequestId_fkey" FOREIGN KEY ("materialRequestId") REFERENCES "material_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_maps" ADD CONSTRAINT "quote_maps_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_map_suppliers" ADD CONSTRAINT "quote_map_suppliers_quoteMapId_fkey" FOREIGN KEY ("quoteMapId") REFERENCES "quote_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_map_suppliers" ADD CONSTRAINT "quote_map_suppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_map_supplier_items" ADD CONSTRAINT "quote_map_supplier_items_quoteMapId_fkey" FOREIGN KEY ("quoteMapId") REFERENCES "quote_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_map_supplier_items" ADD CONSTRAINT "quote_map_supplier_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_map_supplier_items" ADD CONSTRAINT "quote_map_supplier_items_materialRequestItemId_fkey" FOREIGN KEY ("materialRequestItemId") REFERENCES "material_request_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_map_winner_items" ADD CONSTRAINT "quote_map_winner_items_quoteMapId_fkey" FOREIGN KEY ("quoteMapId") REFERENCES "quote_maps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_map_winner_items" ADD CONSTRAINT "quote_map_winner_items_materialRequestItemId_fkey" FOREIGN KEY ("materialRequestItemId") REFERENCES "material_request_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_map_winner_items" ADD CONSTRAINT "quote_map_winner_items_winnerSupplierId_fkey" FOREIGN KEY ("winnerSupplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

