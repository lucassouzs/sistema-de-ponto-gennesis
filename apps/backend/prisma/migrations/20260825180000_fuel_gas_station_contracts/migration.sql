-- Contratos vinculados a postos de combustível (N:N)
CREATE TABLE IF NOT EXISTS "fuel_gas_station_contracts" (
  "id" TEXT NOT NULL,
  "stationId" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fuel_gas_station_contracts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "fuel_gas_station_contracts_stationId_contractId_key"
  ON "fuel_gas_station_contracts"("stationId", "contractId");

CREATE INDEX IF NOT EXISTS "fuel_gas_station_contracts_stationId_idx"
  ON "fuel_gas_station_contracts"("stationId");

CREATE INDEX IF NOT EXISTS "fuel_gas_station_contracts_contractId_idx"
  ON "fuel_gas_station_contracts"("contractId");

DO $$ BEGIN
  ALTER TABLE "fuel_gas_station_contracts"
    ADD CONSTRAINT "fuel_gas_station_contracts_stationId_fkey"
    FOREIGN KEY ("stationId") REFERENCES "fuel_gas_stations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "fuel_gas_station_contracts"
    ADD CONSTRAINT "fuel_gas_station_contracts_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "contracts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
