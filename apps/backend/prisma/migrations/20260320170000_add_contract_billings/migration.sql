-- CreateTable
CREATE TABLE "contract_billings" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "serviceOrder" TEXT NOT NULL,
    "grossValue" DECIMAL(15,2) NOT NULL,
    "netValue" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_billings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_billings_contractId_idx" ON "contract_billings"("contractId");

-- AddForeignKey
ALTER TABLE "contract_billings" ADD CONSTRAINT "contract_billings_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
