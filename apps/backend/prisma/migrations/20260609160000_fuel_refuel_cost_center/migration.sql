ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "costCenter" TEXT;
ALTER TABLE "fuel_refuel_requests" ALTER COLUMN "contractId" DROP NOT NULL;
