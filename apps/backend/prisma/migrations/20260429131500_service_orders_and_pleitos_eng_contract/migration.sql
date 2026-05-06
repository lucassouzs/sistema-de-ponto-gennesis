-- Tabela service_orders + colunas de engenharia em pleitos (competência, valor, vínculo OS).
-- Produção pode não ter recebido estes objetos se só existia `prisma migrate` antigo (sem `db push` local).
-- Script idempotente onde possível.

DO $$
BEGIN
  CREATE TYPE "ServiceOrderStatus" AS ENUM ('NAO_INICIADO', 'EM_EXECUCAO', 'EM_ANDAMENTO', 'FINALIZADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "service_orders" (
    "id" TEXT NOT NULL,
    "costCenterId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "previsaoFim" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'NAO_INICIADO',
    "justificativa" TEXT,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_orders_costCenterId_numero_ano_key" ON "service_orders"("costCenterId", "numero", "ano");
CREATE INDEX IF NOT EXISTS "service_orders_costCenterId_idx" ON "service_orders"("costCenterId");
CREATE INDEX IF NOT EXISTS "service_orders_status_idx" ON "service_orders"("status");

DO $$
BEGIN
  ALTER TABLE "service_orders"
    ADD CONSTRAINT "service_orders_costCenterId_fkey"
    FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "serviceOrderId" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "mes" INTEGER;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "ano" INTEGER;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "valorPrevisto" DECIMAL(14,2);
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "valorExecutado" DECIMAL(14,2);
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "dataMedicao" TIMESTAMP(3);
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "observacao" TEXT;

UPDATE "pleitos" SET "valorExecutado" = COALESCE("valorExecutado", 0);
UPDATE "pleitos" SET "valorPrevisto" = COALESCE("valorPrevisto", 0) WHERE "valorPrevisto" IS NULL;

UPDATE "pleitos" p SET
  "mes" = COALESCE(
    p."mes",
    CASE
      WHEN trim(COALESCE(p."creationMonth", '')) ~ '^[0-9]+$' THEN
        GREATEST(1, LEAST(12, CAST(trim(p."creationMonth") AS INTEGER)))
      ELSE NULL
    END,
    CAST(EXTRACT(MONTH FROM COALESCE(p."createdAt", CURRENT_TIMESTAMP)) AS INTEGER)
  ),
  "ano" = COALESCE(
    p."ano",
    p."creationYear",
    CAST(EXTRACT(YEAR FROM COALESCE(p."createdAt", CURRENT_TIMESTAMP)) AS INTEGER)
  );

UPDATE "pleitos" SET
  "valorPrevisto" = GREATEST(
    0.01::DECIMAL(14,2),
    COALESCE("budgetAmount4", "budgetAmount3", "budgetAmount2", "budgetAmount1", 0::DECIMAL(14,2))
  )
WHERE COALESCE("valorPrevisto", 0) <= 0;

DO $$
DECLARE
  r RECORD;
  v_id TEXT;
  v_num INTEGER;
  v_ms INTEGER;
  v_yr INTEGER;
  v_val NUMERIC;
  v_di TIMESTAMP(3);
  v_df TIMESTAMP(3);
  desc_snip TEXT;
BEGIN
  FOR r IN
    SELECT
      p.id AS pleito_id,
      p."mes" AS pm,
      p."ano" AS pa,
      p."creationMonth",
      p."creationYear",
      p."startDate",
      p."endDate",
      p."createdAt",
      p."budgetAmount1",
      p."budgetAmount2",
      p."budgetAmount3",
      p."budgetAmount4",
      c."costCenterId",
      c."startDate" AS c_start,
      c."endDate" AS c_end
    FROM "pleitos" p
    INNER JOIN "contracts" c ON p."updatedContractId" = c.id
    WHERE p."serviceOrderId" IS NULL
       OR NOT EXISTS (SELECT 1 FROM "service_orders" so WHERE so.id = p."serviceOrderId")
  LOOP
    v_ms := COALESCE(
      r.pm,
      CASE
        WHEN trim(COALESCE(r."creationMonth", '')) ~ '^[0-9]+$' THEN
          GREATEST(1, LEAST(12, CAST(trim(r."creationMonth") AS INTEGER)))
        ELSE NULL
      END,
      CAST(EXTRACT(MONTH FROM COALESCE(r."startDate", r."createdAt", CURRENT_TIMESTAMP)) AS INTEGER)
    );

    v_yr := COALESCE(
      r.pa,
      r."creationYear",
      CAST(EXTRACT(YEAR FROM COALESCE(r."startDate", r."createdAt", CURRENT_TIMESTAMP)) AS INTEGER)
    );

    v_val := GREATEST(
      0.01::NUMERIC,
      COALESCE(r."budgetAmount4", r."budgetAmount3", r."budgetAmount2", r."budgetAmount1", 0::NUMERIC)
    );

    SELECT COALESCE(MAX(so.numero), 0) + 1 INTO v_num
    FROM "service_orders" so
    WHERE so."costCenterId" = r."costCenterId" AND so.ano = v_yr;

    v_di := COALESCE(r."startDate", r.c_start, CURRENT_TIMESTAMP);
    v_df := COALESCE(r."endDate", r.c_end, v_di + INTERVAL '365 days');
    IF v_df <= v_di THEN
      v_df := v_di + INTERVAL '1 day';
    END IF;

    v_id := gen_random_uuid()::TEXT;

    SELECT substring("serviceDescription", 1, 5000) INTO desc_snip FROM "pleitos" WHERE id = r.pleito_id;

    INSERT INTO "service_orders" (
      "id", "costCenterId", "numero", "ano", "dataInicio", "previsaoFim", "valor", "status", "descricao", "updatedAt"
    ) VALUES (
      v_id,
      r."costCenterId",
      v_num,
      v_yr,
      v_di,
      v_df,
      v_val,
      'NAO_INICIADO'::"ServiceOrderStatus",
      desc_snip,
      CURRENT_TIMESTAMP
    );

    UPDATE "pleitos" SET
      "serviceOrderId" = v_id,
      "mes" = v_ms,
      "ano" = v_yr,
      "valorPrevisto" = CASE WHEN COALESCE("valorPrevisto", 0) <= 0 THEN v_val ELSE "valorPrevisto" END,
      "valorExecutado" = COALESCE("valorExecutado", 0)
    WHERE id = r.pleito_id;
  END LOOP;
END $$;

DELETE FROM "pleitos" WHERE "serviceOrderId" IS NULL;

ALTER TABLE "pleitos" ALTER COLUMN "serviceOrderId" SET NOT NULL;
ALTER TABLE "pleitos" ALTER COLUMN "mes" SET NOT NULL;
ALTER TABLE "pleitos" ALTER COLUMN "ano" SET NOT NULL;
ALTER TABLE "pleitos" ALTER COLUMN "valorPrevisto" SET NOT NULL;
ALTER TABLE "pleitos" ALTER COLUMN "valorExecutado" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "pleitos_serviceOrderId_mes_ano_key" ON "pleitos"("serviceOrderId", "mes", "ano");
CREATE INDEX IF NOT EXISTS "pleitos_ano_mes_idx" ON "pleitos"("ano", "mes");
CREATE INDEX IF NOT EXISTS "pleitos_serviceOrderId_idx" ON "pleitos"("serviceOrderId");

DO $$
BEGIN
  ALTER TABLE "pleitos"
    ADD CONSTRAINT "pleitos_serviceOrderId_fkey"
    FOREIGN KEY ("serviceOrderId") REFERENCES "service_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
