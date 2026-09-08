-- CreateEnum
CREATE TYPE "VehicleReservationStatus" AS ENUM ('PENDING_SUPPLIES', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "vehicle_reservations"
  ADD COLUMN "status" "VehicleReservationStatus" NOT NULL DEFAULT 'PENDING_SUPPLIES',
  ADD COLUMN "suppliesApprovedById" TEXT,
  ADD COLUMN "suppliesApprovedAt" TIMESTAMP(3),
  ADD COLUMN "suppliesApprovalComment" TEXT,
  ADD COLUMN "suppliesRejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "vehicle_reservations_status_idx" ON "vehicle_reservations"("status");

-- AddForeignKey
ALTER TABLE "vehicle_reservations"
  ADD CONSTRAINT "vehicle_reservations_suppliesApprovedById_fkey"
  FOREIGN KEY ("suppliesApprovedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
