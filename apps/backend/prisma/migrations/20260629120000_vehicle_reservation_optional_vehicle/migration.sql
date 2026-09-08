-- AlterTable
ALTER TABLE "vehicle_reservations" ALTER COLUMN "vehicleId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "vehicle_reservations" ADD COLUMN "observacaoCapacidadeVeiculo" TEXT;
