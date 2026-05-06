-- CreateTable
CREATE TABLE "user_contract_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_contract_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_contract_permissions_userId_contractId_key" ON "user_contract_permissions"("userId", "contractId");

-- CreateIndex
CREATE INDEX "user_contract_permissions_userId_idx" ON "user_contract_permissions"("userId");

-- CreateIndex
CREATE INDEX "user_contract_permissions_contractId_idx" ON "user_contract_permissions"("contractId");

-- AddForeignKey
ALTER TABLE "user_contract_permissions" ADD CONSTRAINT "user_contract_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_contract_permissions" ADD CONSTRAINT "user_contract_permissions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_contract_permissions" ADD CONSTRAINT "user_contract_permissions_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
