-- DropForeignKey
ALTER TABLE "dp_requests" DROP CONSTRAINT IF EXISTS "dp_requests_contractId_fkey";

-- AlterTable
ALTER TABLE "espelho_nf_bank_accounts" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "espelho_nf_mirrors" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "espelho_nf_service_providers" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "espelho_nf_service_takers" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "espelho_nf_tax_codes" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payment_conditions" ALTER COLUMN "parcelDueDays" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pleitos" ALTER COLUMN "valorExecutado" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "service_orders" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "cacambas" (
    "id" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "serviceOrderId" TEXT,
    "numero" TEXT,
    "dataLocacao" TIMESTAMP(3),
    "dataDevolucao" TIMESTAMP(3),
    "valor" DECIMAL(12,2),
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cacambas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_additives" (
    "id" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "descricao" TEXT,
    "dataAditivo" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_additives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_goals" (
    "id" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "meta" DECIMAL(14,2) NOT NULL,
    "executado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cacambas_costCenterId_idx" ON "cacambas"("costCenterId");

-- CreateIndex
CREATE INDEX "cacambas_serviceOrderId_idx" ON "cacambas"("serviceOrderId");

-- CreateIndex
CREATE INDEX "contract_additives_costCenterId_idx" ON "contract_additives"("costCenterId");

-- CreateIndex
CREATE INDEX "monthly_goals_ano_mes_idx" ON "monthly_goals"("ano", "mes");

-- CreateIndex
CREATE INDEX "monthly_goals_costCenterId_idx" ON "monthly_goals"("costCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_goals_costCenterId_mes_ano_key" ON "monthly_goals"("costCenterId", "mes", "ano");

-- CreateIndex
CREATE INDEX "chats_recipientId_idx" ON "chats"("recipientId");

-- AddForeignKey
ALTER TABLE "cacambas" ADD CONSTRAINT "cacambas_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cacambas" ADD CONSTRAINT "cacambas_serviceOrderId_fkey" FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_additives" ADD CONSTRAINT "contract_additives_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_goals" ADD CONSTRAINT "monthly_goals_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_map_supplier_items" ADD CONSTRAINT "quote_map_supplier_items_quoteMapId_supplierId_fkey" FOREIGN KEY ("quoteMapId", "supplierId") REFERENCES "quote_map_suppliers"("quoteMapId", "supplierId") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "quote_map_supplier_items_quoteMapId_supplierId_materialRequestI" RENAME TO "quote_map_supplier_items_quoteMapId_supplierId_materialRequ_key";
