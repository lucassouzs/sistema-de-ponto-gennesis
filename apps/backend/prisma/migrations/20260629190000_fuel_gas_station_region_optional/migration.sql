-- Novos postos usam cityCode + displayNumber; regionId fica opcional (legado).
ALTER TABLE "fuel_gas_stations" ALTER COLUMN "regionId" DROP NOT NULL;

-- Garante cityCode nos registros antigos
UPDATE "fuel_gas_stations" gs
SET "cityCode" = r.code
FROM "fuel_administrative_regions" r
WHERE gs."regionId" = r.id AND (gs."cityCode" IS NULL OR gs."cityCode" = '');

-- Numera postos que ainda não têm displayNumber
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "createdAt", id) AS rn
  FROM "fuel_gas_stations"
  WHERE "displayNumber" IS NULL
)
UPDATE "fuel_gas_stations" gs
SET "displayNumber" = numbered.rn + COALESCE((SELECT MAX("displayNumber") FROM "fuel_gas_stations" WHERE "displayNumber" IS NOT NULL), 0)
FROM numbered
WHERE gs.id = numbered.id;

-- cityCode obrigatório para novos cadastros (fallback só se ainda houver nulo)
UPDATE "fuel_gas_stations"
SET "cityCode" = 'DF_TAGUATINGA'
WHERE "cityCode" IS NULL OR "cityCode" = '';

ALTER TABLE "fuel_gas_stations" ALTER COLUMN "cityCode" SET NOT NULL;
ALTER TABLE "fuel_gas_stations" ALTER COLUMN "displayNumber" SET NOT NULL;
