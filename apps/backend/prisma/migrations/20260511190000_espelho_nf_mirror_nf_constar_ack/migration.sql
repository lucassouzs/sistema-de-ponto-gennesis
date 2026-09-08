ALTER TABLE "espelho_nf_mirrors" ADD COLUMN IF NOT EXISTS "nfConstarNaNotaAcknowledged" BOOLEAN NOT NULL DEFAULT false;
