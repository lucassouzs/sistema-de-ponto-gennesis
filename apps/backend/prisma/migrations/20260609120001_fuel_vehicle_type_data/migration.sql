-- AlterTable
ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "vehicleType" "FuelVehicleType";

-- Solicitações já aprovadas pelo gestor passam a aguardar Suprimentos
UPDATE "fuel_refuel_requests"
SET "status" = 'PENDING_SUPPLIES'
WHERE "status" = 'APPROVED';
