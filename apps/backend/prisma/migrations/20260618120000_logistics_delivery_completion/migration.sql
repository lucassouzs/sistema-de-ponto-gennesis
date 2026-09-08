-- CreateEnum
CREATE TYPE "LogisticsDeliveryRequestStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "LogisticsDeliveryOutcome" AS ENUM ('DELIVERED', 'PARTIAL', 'NOT_DELIVERED');

-- AlterTable
ALTER TABLE "logistics_delivery_requests"
ADD COLUMN "status" "LogisticsDeliveryRequestStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "logistics_delivery_requests_status_idx" ON "logistics_delivery_requests"("status");

-- CreateTable
CREATE TABLE "logistics_delivery_completions" (
    "id" TEXT NOT NULL,
    "deliveryRequestId" TEXT NOT NULL,
    "receivingLocation" TEXT NOT NULL,
    "receivingResponsible" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "deliveryOutcome" "LogisticsDeliveryOutcome" NOT NULL,
    "locationPhotoUrl" TEXT NOT NULL,
    "locationPhotoKey" TEXT,
    "observations" TEXT,
    "completedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logistics_delivery_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logistics_delivery_invoice_attachments" (
    "id" TEXT NOT NULL,
    "completionId" TEXT NOT NULL,
    "attachmentUrl" TEXT NOT NULL,
    "attachmentName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logistics_delivery_invoice_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "logistics_delivery_completions_deliveryRequestId_key" ON "logistics_delivery_completions"("deliveryRequestId");

-- CreateIndex
CREATE INDEX "logistics_delivery_completions_completedBy_idx" ON "logistics_delivery_completions"("completedBy");

-- CreateIndex
CREATE INDEX "logistics_delivery_completions_receivedAt_idx" ON "logistics_delivery_completions"("receivedAt");

-- CreateIndex
CREATE INDEX "logistics_delivery_invoice_attachments_completionId_idx" ON "logistics_delivery_invoice_attachments"("completionId");

-- AddForeignKey
ALTER TABLE "logistics_delivery_completions" ADD CONSTRAINT "logistics_delivery_completions_deliveryRequestId_fkey" FOREIGN KEY ("deliveryRequestId") REFERENCES "logistics_delivery_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_delivery_completions" ADD CONSTRAINT "logistics_delivery_completions_completedBy_fkey" FOREIGN KEY ("completedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logistics_delivery_invoice_attachments" ADD CONSTRAINT "logistics_delivery_invoice_attachments_completionId_fkey" FOREIGN KEY ("completionId") REFERENCES "logistics_delivery_completions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
