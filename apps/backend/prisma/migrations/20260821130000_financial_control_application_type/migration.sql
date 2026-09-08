-- Tipo do lançamento: MATERIAL | SERVICO | MISTO
ALTER TABLE "financial_control_entries" ADD COLUMN IF NOT EXISTS "applicationType" TEXT;
