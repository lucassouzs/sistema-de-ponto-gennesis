-- CreateEnum
CREATE TYPE "FinancialControlStatus" AS ENUM ('PROCESSO_COMPLETO', 'PAGO', 'AGUARDAR_NOTA', 'CANCELADO');

-- CreateTable
CREATE TABLE "financial_control_entries" (
    "id" TEXT NOT NULL,
    "paymentMonth" INTEGER NOT NULL,
    "paymentYear" INTEGER NOT NULL,
    "status" "FinancialControlStatus" NOT NULL DEFAULT 'AGUARDAR_NOTA',
    "osCode" TEXT,
    "supplierName" TEXT,
    "parcelNumber" TEXT,
    "emissionDate" TIMESTAMP(3),
    "boleto" TEXT,
    "dueDate" TIMESTAMP(3),
    "originalValue" DECIMAL(15,2),
    "ocNumber" TEXT,
    "finalValue" DECIMAL(15,2),
    "paidDate" TIMESTAMP(3),
    "remainingDays" INTEGER,
    "receivedNote" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,

    CONSTRAINT "financial_control_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_control_entries_paymentYear_paymentMonth_idx" ON "financial_control_entries"("paymentYear", "paymentMonth");

-- CreateIndex
CREATE INDEX "financial_control_entries_status_idx" ON "financial_control_entries"("status");

-- CreateIndex
CREATE INDEX "financial_control_entries_dueDate_idx" ON "financial_control_entries"("dueDate");

-- CreateIndex
CREATE INDEX "financial_control_entries_supplierName_idx" ON "financial_control_entries"("supplierName");
