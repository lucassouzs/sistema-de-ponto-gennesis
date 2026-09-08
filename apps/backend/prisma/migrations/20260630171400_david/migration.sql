-- DropForeignKey
ALTER TABLE "fuel_gas_stations" DROP CONSTRAINT "fuel_gas_stations_regionId_fkey";

-- CreateIndex
CREATE INDEX "fuel_refuel_requests_satelliteCityCode_idx" ON "fuel_refuel_requests"("satelliteCityCode");

-- AddForeignKey
ALTER TABLE "fuel_gas_stations" ADD CONSTRAINT "fuel_gas_stations_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "fuel_administrative_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
