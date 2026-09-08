ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "suppliesApprovedBy" TEXT;
ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "suppliesApprovedAt" TIMESTAMP(3);
ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "suppliesApprovalComment" TEXT;
ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "suppliesRejectionReason" TEXT;
ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "refuelReportedAt" TIMESTAMP(3);
ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "odometerKm" INTEGER;
ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "tankLevelAfter" "FuelTankLevelAfter";
ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "refuelReportObservations" TEXT;
ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "receiptPhotoUrl" TEXT;
ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "receiptPhotoKey" TEXT;
ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "receiptPhotoName" TEXT;
ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "litersRefueled" DECIMAL(10,3);
ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "pricePerLiter" DECIMAL(10,2);

DO $$ BEGIN
  ALTER TABLE "fuel_refuel_requests"
    ADD CONSTRAINT "fuel_refuel_requests_suppliesApprovedBy_fkey"
    FOREIGN KEY ("suppliesApprovedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
