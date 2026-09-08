-- AlterEnum
ALTER TYPE "VehicleReservationStatus" ADD VALUE IF NOT EXISTS 'INSPECTED';

-- AlterTable
ALTER TABLE "vehicle_reservations"
  ADD COLUMN "vistoriaAt" DATE,
  ADD COLUMN "vistoriaLaudoUrl" TEXT,
  ADD COLUMN "vistoriaLaudoKey" TEXT,
  ADD COLUMN "vistoriaLaudoFileName" TEXT,
  ADD COLUMN "vistoriaReportedAt" TIMESTAMP(3),
  ADD COLUMN "vistoriaReportedById" TEXT;

-- AddForeignKey
ALTER TABLE "vehicle_reservations"
  ADD CONSTRAINT "vehicle_reservations_vistoriaReportedById_fkey"
  FOREIGN KEY ("vistoriaReportedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
