-- Código tributário: garantia complementar
ALTER TABLE "espelho_nf_tax_codes" ADD COLUMN IF NOT EXISTS "hasComplementaryWarranty" BOOLEAN NOT NULL DEFAULT false;
