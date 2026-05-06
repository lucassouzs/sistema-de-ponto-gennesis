-- AlterTable (pv=RVI e ipi=RVF: Decimal -> String para FEITO/PENDENTE)
-- Bases antigas podem não ter pv/ipi
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "pv" DECIMAL(15,4);
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "ipi" DECIMAL(15,4);

ALTER TABLE "pleitos" ALTER COLUMN "pv" DROP DEFAULT;
ALTER TABLE "pleitos" ALTER COLUMN "pv" TYPE TEXT USING ("pv"::text);
ALTER TABLE "pleitos" ALTER COLUMN "ipi" DROP DEFAULT;
ALTER TABLE "pleitos" ALTER COLUMN "ipi" TYPE TEXT USING ("ipi"::text);
