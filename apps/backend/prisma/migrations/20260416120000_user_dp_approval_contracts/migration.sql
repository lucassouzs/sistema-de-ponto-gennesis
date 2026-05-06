-- CreateTable
CREATE TABLE "user_dp_approval_contracts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_dp_approval_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_dp_approval_contracts_userId_contractId_key" ON "user_dp_approval_contracts"("userId", "contractId");

-- CreateIndex
CREATE INDEX "user_dp_approval_contracts_userId_idx" ON "user_dp_approval_contracts"("userId");

-- CreateIndex
CREATE INDEX "user_dp_approval_contracts_contractId_idx" ON "user_dp_approval_contracts"("contractId");

-- AddForeignKey
ALTER TABLE "user_dp_approval_contracts" ADD CONSTRAINT "user_dp_approval_contracts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dp_approval_contracts" ADD CONSTRAINT "user_dp_approval_contracts_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dp_approval_contracts" ADD CONSTRAINT "user_dp_approval_contracts_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "position_permission_templates" ADD COLUMN "dpApprovalContractIds" JSONB NOT NULL DEFAULT '[]';
