-- CreateTable
CREATE TABLE "contract_annual_values" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_annual_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contract_annual_values_contractId_year_key" ON "contract_annual_values"("contractId", "year");

-- CreateIndex
CREATE INDEX "contract_annual_values_contractId_idx" ON "contract_annual_values"("contractId");

-- AddForeignKey
ALTER TABLE "contract_annual_values" ADD CONSTRAINT "contract_annual_values_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
