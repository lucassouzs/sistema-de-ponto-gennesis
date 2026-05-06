-- AlterTable (TEXT -> DECIMAL)
-- Tabelas antigas podem não ter billingRequest
ALTER TABLE "pleitos" ADD COLUMN IF NOT EXISTS "billingRequest" TEXT;

ALTER TABLE "pleitos" ALTER COLUMN "billingRequest" DROP DEFAULT;
ALTER TABLE "pleitos" ALTER COLUMN "billingRequest" TYPE DECIMAL(15,2) USING (
  CASE
    WHEN "billingRequest" IS NULL OR trim("billingRequest"::text) = '' THEN NULL
    ELSE trim("billingRequest"::text)::numeric
  END
);
