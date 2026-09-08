-- CreateEnum
CREATE TYPE "MaterialDeliveryPolo" AS ENUM ('DF', 'GO');

-- CreateEnum
CREATE TYPE "MaterialDeliveryCurrentStatus" AS ENUM (
  'ENTREGA_FORNECEDOR_CIF',
  'APROVADO_SUPRIMENTOS',
  'ENTREGA_LOGISTICA_FOB',
  'ENTREGUE',
  'APROVAR_DIR',
  'CANCELADO'
);

-- CreateEnum
CREATE TYPE "MaterialDeliveryPaymentStatus" AS ENUM (
  'OK',
  'AGUARDANDO_PAGAMENTO',
  'BOLETO',
  'A_VISTA',
  'CANCELADO',
  'CREDITO'
);

-- CreateEnum
CREATE TYPE "MaterialDeliveryFinalStatus" AS ENUM ('PENDENTE', 'CONCLUIDO', 'CANCELADO');

-- CreateTable
CREATE TABLE "material_deliveries" (
  "id" TEXT NOT NULL,
  "deliveryNumber" TEXT NOT NULL,
  "polo" "MaterialDeliveryPolo" NOT NULL,
  "movementId" TEXT,
  "movementNumber" TEXT,
  "contract" TEXT,
  "currentStatus" "MaterialDeliveryCurrentStatus" NOT NULL DEFAULT 'APROVADO_SUPRIMENTOS',
  "paymentStatus" "MaterialDeliveryPaymentStatus" NOT NULL DEFAULT 'AGUARDANDO_PAGAMENTO',
  "supplierId" TEXT,
  "supplierName" TEXT,
  "purchaseOrderId" TEXT,
  "orderValue" DECIMAL(15,2),
  "expectedDelivery" TIMESTAMP(3),
  "actualDelivery" TIMESTAMP(3),
  "totalPaid" DECIMAL(15,2),
  "stockShortfallNotes" TEXT,
  "rmNumber" TEXT,
  "deliveryType" TEXT,
  "observations" TEXT,
  "finalStatus" "MaterialDeliveryFinalStatus" NOT NULL DEFAULT 'PENDENTE',
  "receivedByEngineering" BOOLEAN NOT NULL DEFAULT false,
  "receivedByUserId" TEXT,
  "receivedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "material_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "material_deliveries_deliveryNumber_key" ON "material_deliveries"("deliveryNumber");

-- CreateIndex
CREATE INDEX "material_deliveries_polo_idx" ON "material_deliveries"("polo");

-- CreateIndex
CREATE INDEX "material_deliveries_currentStatus_idx" ON "material_deliveries"("currentStatus");

-- CreateIndex
CREATE INDEX "material_deliveries_paymentStatus_idx" ON "material_deliveries"("paymentStatus");

-- CreateIndex
CREATE INDEX "material_deliveries_finalStatus_idx" ON "material_deliveries"("finalStatus");

-- CreateIndex
CREATE INDEX "material_deliveries_receivedByEngineering_idx" ON "material_deliveries"("receivedByEngineering");

-- CreateIndex
CREATE INDEX "material_deliveries_expectedDelivery_idx" ON "material_deliveries"("expectedDelivery");

-- CreateIndex
CREATE INDEX "material_deliveries_supplierId_idx" ON "material_deliveries"("supplierId");

-- CreateIndex
CREATE INDEX "material_deliveries_purchaseOrderId_idx" ON "material_deliveries"("purchaseOrderId");

-- AddForeignKey
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_deliveries" ADD CONSTRAINT "material_deliveries_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
