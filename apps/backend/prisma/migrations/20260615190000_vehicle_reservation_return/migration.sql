-- AlterEnum
ALTER TYPE "VehicleReservationStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';

-- AlterTable
ALTER TABLE "vehicle_reservations"
  ADD COLUMN "devolucaoAt" TIMESTAMP(3),
  ADD COLUMN "baixaObservacao" TEXT,
  ADD COLUMN "baixaFotoUrl" TEXT,
  ADD COLUMN "baixaFotoKey" TEXT,
  ADD COLUMN "baixaAssinatura" TEXT,
  ADD COLUMN "baixaReportedAt" TIMESTAMP(3),
  ADD COLUMN "baixaReportedById" TEXT;

-- AddForeignKey
ALTER TABLE "vehicle_reservations"
  ADD CONSTRAINT "vehicle_reservations_baixaReportedById_fkey"
  FOREIGN KEY ("baixaReportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
