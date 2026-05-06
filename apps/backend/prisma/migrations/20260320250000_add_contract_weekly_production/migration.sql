-- CreateTable
CREATE TABLE "contract_weekly_productions" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "divSe" TEXT NOT NULL,
    "weeklyProductionValue" DECIMAL(15,2) NOT NULL,
    "responsiblePerson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_weekly_productions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contract_weekly_productions_contractId_idx" ON "contract_weekly_productions"("contractId");

-- AddForeignKey
ALTER TABLE "contract_weekly_productions" ADD CONSTRAINT "contract_weekly_productions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
