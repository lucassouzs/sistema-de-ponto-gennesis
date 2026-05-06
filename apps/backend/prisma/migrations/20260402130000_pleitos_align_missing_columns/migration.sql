-- Alinha tabela pleitos quando ela existia antes de add_pleitos completo (drift local).
-- Todas as colunas do model Pleito atual; IF NOT EXISTS evita duplicar.

ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "creationMonth" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "creationYear" INTEGER;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "endDate" TIMESTAMP(3);
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "budgetStatus" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "folderNumber" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "lot" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "divSe" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "unit" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "serviceDescription" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "budget" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "executionStatus" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "billingStatus" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "updatedContractId" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "accumulatedBilled" DECIMAL(15,2);
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "billingRequest" DECIMAL(15,2);
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "invoiceNumber" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "estimator" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "budgetAmount1" DECIMAL(15,2);
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "budgetAmount2" DECIMAL(15,2);
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "budgetAmount3" DECIMAL(15,2);
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "budgetAmount4" DECIMAL(15,2);
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "pv" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "ipi" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "reportsBilling" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "engineer" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "supervisor" TEXT;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- serviceDescription obrigatório no Prisma: preenche linhas antigas vazias
UPDATE "pleitos" SET "serviceDescription" = COALESCE("serviceDescription", '');
ALTER TABLE "pleitos" ALTER COLUMN "serviceDescription" SET NOT NULL;

-- pv/ipi podem ter ficado como numeric em bases antigas; Prisma espera TEXT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pleitos' AND column_name = 'pv' AND data_type = 'numeric'
  ) THEN
    ALTER TABLE "pleitos" ALTER COLUMN "pv" TYPE TEXT USING ("pv"::text);
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pleitos' AND column_name = 'ipi' AND data_type = 'numeric'
  ) THEN
    ALTER TABLE "pleitos" ALTER COLUMN "ipi" TYPE TEXT USING ("ipi"::text);
  END IF;
END $$;

-- billingRequest pode ter ficado como TEXT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'pleitos' AND column_name = 'billingRequest'
      AND data_type IN ('text', 'character varying')
  ) THEN
    ALTER TABLE "pleitos" ALTER COLUMN "billingRequest" TYPE DECIMAL(15,2) USING (
      CASE
        WHEN "billingRequest" IS NULL OR trim("billingRequest"::text) = '' THEN NULL
        ELSE trim("billingRequest"::text)::numeric
      END
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "pleitos_folderNumber_idx" ON "pleitos"("folderNumber");
CREATE INDEX IF NOT EXISTS "pleitos_updatedContractId_idx" ON "pleitos"("updatedContractId");

-- FK se contracts existir e ainda não houver constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pleitos_updatedContractId_fkey'
  ) THEN
    ALTER TABLE "pleitos"
      ADD CONSTRAINT "pleitos_updatedContractId_fkey"
      FOREIGN KEY ("updatedContractId") REFERENCES "contracts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
