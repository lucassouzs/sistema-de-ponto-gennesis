-- Remove colunas opcionais de centros de custo que não são usadas pelo app e geravam inconsistência com o Prisma/produção.
-- IF EXISTS permite aplicar mesmo se algum ambiente nunca criou uma coluna.
ALTER TABLE "cost_centers" DROP COLUMN IF EXISTS "dataInicio";
ALTER TABLE "cost_centers" DROP COLUMN IF EXISTS "dataFim";
ALTER TABLE "cost_centers" DROP COLUMN IF EXISTS "orgao";
ALTER TABLE "cost_centers" DROP COLUMN IF EXISTS "prazoMeses";
ALTER TABLE "cost_centers" DROP COLUMN IF EXISTS "valorTotal";
