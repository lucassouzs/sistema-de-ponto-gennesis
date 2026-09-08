-- Espelho NF: colunas de período da medição (alinhadas ao schema Prisma)
ALTER TABLE "espelho_nf_mirrors" ADD COLUMN IF NOT EXISTS "measurementStartDate" TEXT;
ALTER TABLE "espelho_nf_mirrors" ADD COLUMN IF NOT EXISTS "measurementEndDate" TEXT;
