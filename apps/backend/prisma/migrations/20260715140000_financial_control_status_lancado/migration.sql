-- Novo status "Lançado" no Controle Financeiro (lançamentos vindos da OC)
DO $$
BEGIN
  ALTER TYPE "FinancialControlStatus" ADD VALUE 'LANCADO';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
