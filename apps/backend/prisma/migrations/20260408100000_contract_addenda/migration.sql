-- CreateTable
CREATE TABLE "contract_addenda" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_addenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_addenda_contractId_idx" ON "contract_addenda"("contractId");

-- CreateIndex
CREATE INDEX "contract_addenda_contractId_effectiveDate_idx" ON "contract_addenda"("contractId", "effectiveDate");

-- AddForeignKey
ALTER TABLE "contract_addenda" ADD CONSTRAINT "contract_addenda_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
