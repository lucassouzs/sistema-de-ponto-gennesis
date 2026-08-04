-- Add setor to cargos_risco and unique (cargo, setor)

ALTER TABLE "cargos_risco" ADD COLUMN "setor" TEXT;

-- Backfill: most frequent department among active employees with that position; else Operacional
UPDATE "cargos_risco" cr
SET "setor" = COALESCE(
  (
    SELECT e."department"
    FROM "employees" e
    INNER JOIN "users" u ON u."id" = e."userId"
    WHERE u."isActive" = true
      AND LOWER(TRIM(e."position")) = LOWER(TRIM(cr."cargo"))
      AND TRIM(e."department") <> ''
    GROUP BY e."department"
    ORDER BY COUNT(*) DESC, e."department" ASC
    LIMIT 1
  ),
  'Operacional'
);

ALTER TABLE "cargos_risco" ALTER COLUMN "setor" SET NOT NULL;

DROP INDEX IF EXISTS "cargos_risco_cargo_key";

CREATE UNIQUE INDEX "cargos_risco_cargo_setor_key" ON "cargos_risco"("cargo", "setor");

CREATE INDEX "cargos_risco_setor_idx" ON "cargos_risco"("setor");
