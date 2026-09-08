-- CreateEnum
CREATE TYPE "FuelRefuelDeadlineUnit" AS ENUM ('HOURS', 'DAYS');

-- AlterTable
ALTER TABLE "company_settings" ADD COLUMN "fuelSuppliesSlaHours" INTEGER NOT NULL DEFAULT 24;

-- CreateTable
CREATE TABLE "fuel_administrative_regions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_administrative_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuel_gas_stations" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuel_gas_stations_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "fuel_refuel_requests" ADD COLUMN "administrativeRegionId" TEXT;
ALTER TABLE "fuel_refuel_requests" ADD COLUMN "gasStationId" TEXT;
ALTER TABLE "fuel_refuel_requests" ADD COLUMN "refuelDeadlineAt" TIMESTAMP(3);
ALTER TABLE "fuel_refuel_requests" ADD COLUMN "refuelDeadlineAmount" INTEGER;
ALTER TABLE "fuel_refuel_requests" ADD COLUMN "refuelDeadlineUnit" "FuelRefuelDeadlineUnit";

-- CreateIndex
CREATE UNIQUE INDEX "fuel_administrative_regions_code_key" ON "fuel_administrative_regions"("code");
CREATE INDEX "fuel_administrative_regions_isActive_idx" ON "fuel_administrative_regions"("isActive");
CREATE INDEX "fuel_gas_stations_regionId_idx" ON "fuel_gas_stations"("regionId");
CREATE INDEX "fuel_gas_stations_isActive_idx" ON "fuel_gas_stations"("isActive");
CREATE INDEX "fuel_refuel_requests_administrativeRegionId_idx" ON "fuel_refuel_requests"("administrativeRegionId");
CREATE INDEX "fuel_refuel_requests_gasStationId_idx" ON "fuel_refuel_requests"("gasStationId");

-- AddForeignKey
ALTER TABLE "fuel_gas_stations" ADD CONSTRAINT "fuel_gas_stations_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "fuel_administrative_regions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fuel_refuel_requests" ADD CONSTRAINT "fuel_refuel_requests_administrativeRegionId_fkey" FOREIGN KEY ("administrativeRegionId") REFERENCES "fuel_administrative_regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fuel_refuel_requests" ADD CONSTRAINT "fuel_refuel_requests_gasStationId_fkey" FOREIGN KEY ("gasStationId") REFERENCES "fuel_gas_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed regiões administrativas e postos iniciais (ajustáveis no banco)
INSERT INTO "fuel_administrative_regions" ("id", "code", "name", "sortOrder", "updatedAt") VALUES
  ('fuel_region_df', 'DF', 'Distrito Federal', 1, CURRENT_TIMESTAMP),
  ('fuel_region_go', 'GO', 'Goiás', 2, CURRENT_TIMESTAMP),
  ('fuel_region_rn', 'RN', 'Rio Grande do Norte', 3, CURRENT_TIMESTAMP),
  ('fuel_region_pb', 'PB', 'Paraíba', 4, CURRENT_TIMESTAMP),
  ('fuel_region_pe', 'PE', 'Pernambuco', 5, CURRENT_TIMESTAMP),
  ('fuel_region_rs', 'RS', 'Rio Grande do Sul', 6, CURRENT_TIMESTAMP),
  ('fuel_region_central', 'CENTRAL', 'Administração Central', 7, CURRENT_TIMESTAMP);

INSERT INTO "fuel_gas_stations" ("id", "regionId", "name", "address", "sortOrder", "updatedAt") VALUES
  ('fuel_station_df_1', 'fuel_region_df', 'Posto credenciado DF — Asa Norte', NULL, 1, CURRENT_TIMESTAMP),
  ('fuel_station_df_2', 'fuel_region_df', 'Posto credenciado DF — Taguatinga', NULL, 2, CURRENT_TIMESTAMP),
  ('fuel_station_go_1', 'fuel_region_go', 'Posto credenciado GO — Goiânia', NULL, 1, CURRENT_TIMESTAMP),
  ('fuel_station_rn_1', 'fuel_region_rn', 'Posto credenciado RN — Natal', NULL, 1, CURRENT_TIMESTAMP),
  ('fuel_station_pb_1', 'fuel_region_pb', 'Posto credenciado PB — João Pessoa', NULL, 1, CURRENT_TIMESTAMP),
  ('fuel_station_pe_1', 'fuel_region_pe', 'Posto credenciado PE — Recife', NULL, 1, CURRENT_TIMESTAMP),
  ('fuel_station_rs_1', 'fuel_region_rs', 'Posto credenciado RS — Porto Alegre', NULL, 1, CURRENT_TIMESTAMP),
  ('fuel_station_central_1', 'fuel_region_central', 'Posto credenciado Central', NULL, 1, CURRENT_TIMESTAMP);
