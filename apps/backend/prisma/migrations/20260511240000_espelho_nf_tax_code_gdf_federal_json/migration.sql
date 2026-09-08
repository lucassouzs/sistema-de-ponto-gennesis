-- Alíquotas federais (JSON por contexto) + flags de qual linha de contrato está ativa na UI.
-- Idempotente: seguro se o script manual já tiver criado as colunas.
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
