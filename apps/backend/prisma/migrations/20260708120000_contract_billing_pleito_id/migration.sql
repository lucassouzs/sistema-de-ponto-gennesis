-- Vincular faturamento ao pleito para rastreabilidade e sincronização
ALTER TABLE "contract_billings" ADD COLUMN IF NOT EXISTS "pleitoId" TEXT;

CREATE INDEX IF NOT EXISTS "contract_billings_pleitoId_idx" ON "contract_billings"("pleitoId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contract_billings_pleitoId_fkey'
  ) THEN
    ALTER TABLE "contract_billings"
      ADD CONSTRAINT "contract_billings_pleitoId_fkey"
      FOREIGN KEY ("pleitoId") REFERENCES "pleitos"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
