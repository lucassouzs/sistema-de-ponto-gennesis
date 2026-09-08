-- Código tributário: alíquota da garantia (%)
ALTER TABLE "espelho_nf_tax_codes" ADD COLUMN IF NOT EXISTS "garantiaAliquota" TEXT NOT NULL DEFAULT '';
