-- CreateTable
CREATE TABLE "material_delivery_geral_lookups" (
  "id" TEXT NOT NULL,
  "lookupKey" TEXT NOT NULL,
  "shortfallType" "MaterialDeliveryStockShortfallType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "material_delivery_geral_lookups_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "material_delivery_geral_lookups_lookupKey_key" ON "material_delivery_geral_lookups"("lookupKey");

-- CreateIndex
CREATE INDEX "material_delivery_geral_lookups_lookupKey_idx" ON "material_delivery_geral_lookups"("lookupKey");
