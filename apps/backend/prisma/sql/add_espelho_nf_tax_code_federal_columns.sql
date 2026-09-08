-- Alíquotas federais por código tributário (matriz JSON + flags de contexto).
-- Use se o DBeaver ainda não mostrar "federalRatesByContext" / "federalTaxContextEnabled".
-- Preferível: na pasta apps/backend rodar `npx prisma migrate deploy` (aplica a migration oficial).

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'espelho_nf_tax_codes'
      AND column_name = 'federalRatesByContext'
  ) THEN
    ALTER TABLE "espelho_nf_tax_codes" ADD COLUMN "federalRatesByContext" JSONB;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'espelho_nf_tax_codes'
      AND column_name = 'federalTaxContextEnabled'
  ) THEN
    ALTER TABLE "espelho_nf_tax_codes" ADD COLUMN "federalTaxContextEnabled" JSONB;
  END IF;
END
$migration$;
