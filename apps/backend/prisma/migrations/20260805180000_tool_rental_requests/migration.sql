-- CreateEnum
CREATE TYPE "ToolRentalDemandType" AS ENUM ('NOVA_LOCACAO', 'RENOVACAO', 'DEVOLUCAO');

-- CreateEnum
CREATE TYPE "ToolRentalPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ToolRentalRequestStatus" AS ENUM ('PENDING_SUPPLIES', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tool_rental_requests" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "polo" TEXT NOT NULL,
    "contrato" TEXT NOT NULL,
    "obra" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "assignedUserId" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierName" TEXT,
    "priority" "ToolRentalPriority" NOT NULL DEFAULT 'MEDIUM',
    "demandType" "ToolRentalDemandType" NOT NULL,
    "equipamento" TEXT NOT NULL,
    "periodoInicio" DATE NOT NULL,
    "periodoFim" DATE NOT NULL,
    "linkSugestao" TEXT,
    "status" "ToolRentalRequestStatus" NOT NULL DEFAULT 'PENDING_SUPPLIES',
    "suppliesApprovedById" TEXT,
    "suppliesApprovedAt" TIMESTAMP(3),
    "suppliesApprovalComment" TEXT,
    "suppliesRejectionReason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_rental_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tool_rental_requests_code_key" ON "tool_rental_requests"("code");

-- CreateIndex
CREATE INDEX "tool_rental_requests_status_idx" ON "tool_rental_requests"("status");

-- CreateIndex
CREATE INDEX "tool_rental_requests_createdById_idx" ON "tool_rental_requests"("createdById");

-- CreateIndex
CREATE INDEX "tool_rental_requests_assignedUserId_idx" ON "tool_rental_requests"("assignedUserId");

-- CreateIndex
CREATE INDEX "tool_rental_requests_createdAt_idx" ON "tool_rental_requests"("createdAt");

-- AddForeignKey
ALTER TABLE "tool_rental_requests" ADD CONSTRAINT "tool_rental_requests_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_rental_requests" ADD CONSTRAINT "tool_rental_requests_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_rental_requests" ADD CONSTRAINT "tool_rental_requests_suppliesApprovedById_fkey" FOREIGN KEY ("suppliesApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_rental_requests" ADD CONSTRAINT "tool_rental_requests_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
