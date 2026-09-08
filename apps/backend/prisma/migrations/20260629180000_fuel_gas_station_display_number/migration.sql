-- AlterTable
ALTER TABLE "fuel_gas_stations" ADD COLUMN IF NOT EXISTS "displayNumber" INTEGER;
ALTER TABLE "fuel_gas_stations" ADD COLUMN IF NOT EXISTS "cityCode" TEXT;

-- Preenche cityCode a partir da região legada
UPDATE "fuel_gas_stations" gs
SET "cityCode" = r.code
FROM "fuel_administrative_regions" r
WHERE gs."regionId" = r.id AND gs."cityCode" IS NULL;

-- Numera postos existentes
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS rn
  FROM "fuel_gas_stations"
  WHERE "displayNumber" IS NULL
)
UPDATE "fuel_gas_stations" gs
SET "displayNumber" = numbered.rn
FROM numbered
WHERE gs.id = numbered.id;

-- Solicitações: código da cidade satélite
ALTER TABLE "fuel_refuel_requests" ADD COLUMN IF NOT EXISTS "satelliteCityCode" TEXT;

UPDATE "fuel_refuel_requests" fr
SET "satelliteCityCode" = r.code
FROM "fuel_administrative_regions" r
WHERE fr."administrativeRegionId" = r.id AND fr."satelliteCityCode" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "fuel_gas_stations_displayNumber_key" ON "fuel_gas_stations"("displayNumber");
CREATE INDEX IF NOT EXISTS "fuel_gas_stations_cityCode_idx" ON "fuel_gas_stations"("cityCode");
