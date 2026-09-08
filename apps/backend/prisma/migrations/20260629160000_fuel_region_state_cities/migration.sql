-- AlterTable
ALTER TABLE "fuel_administrative_regions" ADD COLUMN IF NOT EXISTS "stateCode" TEXT;

UPDATE "fuel_administrative_regions" SET "stateCode" = 'DF' WHERE "stateCode" IS NULL;

ALTER TABLE "fuel_administrative_regions" ALTER COLUMN "stateCode" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "fuel_administrative_regions_stateCode_idx" ON "fuel_administrative_regions"("stateCode");

-- Desativa regiões antigas por polo/estado (substituídas por cidades satélites)
UPDATE "fuel_administrative_regions"
SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" IN ('DF', 'GO', 'RN', 'PB', 'PE', 'RS', 'CENTRAL');

-- Cidades satélites — DF
INSERT INTO "fuel_administrative_regions" ("id", "code", "name", "stateCode", "sortOrder", "updatedAt") VALUES
  ('fuel_city_df_taguatinga', 'DF_TAGUATINGA', 'Taguatinga', 'DF', 1, CURRENT_TIMESTAMP),
  ('fuel_city_df_ceilandia', 'DF_CEILANDIA', 'Ceilândia', 'DF', 2, CURRENT_TIMESTAMP),
  ('fuel_city_df_samambaia', 'DF_SAMAMBAIA', 'Samambaia', 'DF', 3, CURRENT_TIMESTAMP),
  ('fuel_city_df_guara', 'DF_GUARA', 'Guará', 'DF', 4, CURRENT_TIMESTAMP),
  ('fuel_city_df_planaltina', 'DF_PLANALTINA', 'Planaltina', 'DF', 5, CURRENT_TIMESTAMP),
  ('fuel_city_df_sao_sebastiao', 'DF_SAO_SEBASTIAO', 'São Sebastião', 'DF', 6, CURRENT_TIMESTAMP),
  ('fuel_city_df_gama', 'DF_GAMA', 'Gama', 'DF', 7, CURRENT_TIMESTAMP),
  ('fuel_city_df_santa_maria', 'DF_SANTA_MARIA', 'Santa Maria', 'DF', 8, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "stateCode" = EXCLUDED."stateCode",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Cidades satélites — GO
INSERT INTO "fuel_administrative_regions" ("id", "code", "name", "stateCode", "sortOrder", "updatedAt") VALUES
  ('fuel_city_go_goiania', 'GO_GOIANIA', 'Goiânia', 'GO', 1, CURRENT_TIMESTAMP),
  ('fuel_city_go_aparecida', 'GO_APARECIDA', 'Aparecida de Goiânia', 'GO', 2, CURRENT_TIMESTAMP),
  ('fuel_city_go_anapolis', 'GO_ANAPOLIS', 'Anápolis', 'GO', 3, CURRENT_TIMESTAMP),
  ('fuel_city_go_trindade', 'GO_TRINDADE', 'Trindade', 'GO', 4, CURRENT_TIMESTAMP),
  ('fuel_city_go_luziania', 'GO_LUZIANIA', 'Luziânia', 'GO', 5, CURRENT_TIMESTAMP),
  ('fuel_city_go_rio_verde', 'GO_RIO_VERDE', 'Rio Verde', 'GO', 6, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "stateCode" = EXCLUDED."stateCode",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Postos exemplo para Taguatinga e Goiânia (demais cidades via tela de cadastro)
INSERT INTO "fuel_gas_stations" ("id", "regionId", "name", "address", "sortOrder", "updatedAt") VALUES
  ('fuel_station_df_tag_1', 'fuel_city_df_taguatinga', 'Posto credenciado — Taguatinga Norte', NULL, 1, CURRENT_TIMESTAMP),
  ('fuel_station_df_tag_2', 'fuel_city_df_taguatinga', 'Posto credenciado — Taguatinga Sul', NULL, 2, CURRENT_TIMESTAMP),
  ('fuel_station_go_gyn_1', 'fuel_city_go_goiania', 'Posto credenciado — Goiânia Centro', NULL, 1, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
