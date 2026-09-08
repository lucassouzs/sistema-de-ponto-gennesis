-- Separate invoice number from installment on financial control entries.
ALTER TABLE "financial_control_entries" ADD COLUMN IF NOT EXISTS "nfNumber" TEXT;

-- 556713-2/2 → nf=556713, parcela=2/2
UPDATE "financial_control_entries"
SET
  "nfNumber" = substring("parcelNumber" from '^(\d+)-\d+/\d+$'),
  "parcelNumber" = substring("parcelNumber" from '^\d+-(\d+/\d+)$')
WHERE "nfNumber" IS NULL
  AND "parcelNumber" IS NOT NULL
  AND "parcelNumber" ~ '^\d+-\d+/\d+$';

-- 005510-1 / 027283-1 → nf=005510, parcela=1 (não divide FL-002016)
UPDATE "financial_control_entries"
SET
  "nfNumber" = substring("parcelNumber" from '^(\d+)-\d{1,3}$'),
  "parcelNumber" = substring("parcelNumber" from '^\d+-(\d{1,3})$')
WHERE "nfNumber" IS NULL
  AND "parcelNumber" IS NOT NULL
  AND "parcelNumber" ~ '^\d+-\d{1,3}$';

-- RECIBO, FL-002016, 0, etc. → tudo na NF; parcela vazia
UPDATE "financial_control_entries"
SET
  "nfNumber" = "parcelNumber",
  "parcelNumber" = NULL
WHERE "nfNumber" IS NULL
  AND "parcelNumber" IS NOT NULL
  AND "parcelNumber" !~ '^\d+/\d+$';

-- Corrige backfill antigo que dividiu FL-002016 em nf=FL + parcela=002016
UPDATE "financial_control_entries"
SET
  "nfNumber" = "nfNumber" || '-' || "parcelNumber",
  "parcelNumber" = NULL
WHERE "nfNumber" IS NOT NULL
  AND "parcelNumber" IS NOT NULL
  AND "nfNumber" !~ '^\d+$'
  AND "parcelNumber" ~ '^\d+$'
  AND "parcelNumber" !~ '/';
