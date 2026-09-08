-- AlterTable
ALTER TABLE "financial_control_entries" ADD COLUMN "consorcio" TEXT NOT NULL DEFAULT 'brasilia';

-- CreateIndex
CREATE INDEX "financial_control_entries_consorcio_idx" ON "financial_control_entries"("consorcio");

-- CreateIndex
CREATE INDEX "financial_control_entries_consorcio_paymentYear_paymentMonth_idx" ON "financial_control_entries"("consorcio", "paymentYear", "paymentMonth");
