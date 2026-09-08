-- CreateEnum
CREATE TYPE "FuelRefuelRequestStatus" AS ENUM ('PENDING_MANAGER', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "gennecy_chat_flow_sessions" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flowType" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gennecy_chat_flow_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_refuel_requests" (
    "id" TEXT NOT NULL,
    "displayNumber" INTEGER NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refuelDate" TIMESTAMP(3) NOT NULL,
    "route" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "vehiclePlate" TEXT NOT NULL,
    "vehicleDescription" TEXT,
    "dashboardPhotoUrl" TEXT,
    "dashboardPhotoKey" TEXT,
    "dashboardPhotoName" TEXT,
    "observations" TEXT,
    "status" "FuelRefuelRequestStatus" NOT NULL DEFAULT 'PENDING_MANAGER',
    "sourceChatId" TEXT,
    "managerApprovedBy" TEXT,
    "managerApprovedAt" TIMESTAMP(3),
    "managerApprovalComment" TEXT,
    "managerRejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_refuel_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gennecy_chat_flow_sessions_chatId_userId_flowType_key" ON "gennecy_chat_flow_sessions"("chatId", "userId", "flowType");

-- CreateIndex
CREATE INDEX "gennecy_chat_flow_sessions_chatId_idx" ON "gennecy_chat_flow_sessions"("chatId");

-- CreateIndex
CREATE INDEX "gennecy_chat_flow_sessions_userId_idx" ON "gennecy_chat_flow_sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "fuel_refuel_requests_displayNumber_key" ON "fuel_refuel_requests"("displayNumber");

-- CreateIndex
CREATE INDEX "fuel_refuel_requests_requesterId_idx" ON "fuel_refuel_requests"("requesterId");

-- CreateIndex
CREATE INDEX "fuel_refuel_requests_contractId_idx" ON "fuel_refuel_requests"("contractId");

-- CreateIndex
CREATE INDEX "fuel_refuel_requests_status_idx" ON "fuel_refuel_requests"("status");

-- CreateIndex
CREATE INDEX "fuel_refuel_requests_refuelDate_idx" ON "fuel_refuel_requests"("refuelDate");

-- AddForeignKey
ALTER TABLE "fuel_refuel_requests" ADD CONSTRAINT "fuel_refuel_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_refuel_requests" ADD CONSTRAINT "fuel_refuel_requests_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fuel_refuel_requests" ADD CONSTRAINT "fuel_refuel_requests_managerApprovedBy_fkey" FOREIGN KEY ("managerApprovedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
