-- CreateTable
CREATE TABLE "pleitos" (
    "id" TEXT NOT NULL,
    "creationMonth" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "budgetStatus" TEXT,
    "folderNumber" TEXT,
    "lot" TEXT,
    "divSe" TEXT,
    "location" TEXT,
    "unit" TEXT,
    "serviceDescription" TEXT NOT NULL,
    "budget" TEXT,
    "executionStatus" TEXT,
    "billingStatus" TEXT,
    "updatedContractId" TEXT,
    "billingRequest" TEXT,
    "invoiceNumber" TEXT,
    "estimator" TEXT,
    "budgetAmount1" DECIMAL(15,2),
    "budgetAmount2" DECIMAL(15,2),
    "budgetAmount3" DECIMAL(15,2),
    "budgetAmount4" DECIMAL(15,2),
    "pv" DECIMAL(15,4),
    "ipi" DECIMAL(15,4),
    "reportsBilling" TEXT,
    "engineer" TEXT,
    "supervisor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pleitos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pleitos_folderNumber_idx" ON "pleitos"("folderNumber");
CREATE INDEX "pleitos_updatedContractId_idx" ON "pleitos"("updatedContractId");

ALTER TABLE "pleitos" ADD CONSTRAINT "pleitos_updatedContractId_fkey" FOREIGN KEY ("updatedContractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
