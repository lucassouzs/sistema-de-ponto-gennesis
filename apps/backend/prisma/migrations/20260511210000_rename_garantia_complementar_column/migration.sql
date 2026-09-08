-- Renomear coluna (texto livre; nome antigo sugeria percentual)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'espelho_nf_mirrors'
      AND column_name = 'garantiaComplementarPct'
  )
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'espelho_nf_mirrors'
      AND column_name = 'garantiaComplementar'
  ) THEN
    ALTER TABLE "espelho_nf_mirrors" RENAME COLUMN "garantiaComplementarPct" TO "garantiaComplementar";
  END IF;
END $$;
