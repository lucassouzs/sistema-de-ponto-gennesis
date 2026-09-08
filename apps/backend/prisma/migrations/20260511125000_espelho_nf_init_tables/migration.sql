-- Espelho NF: criação idempotente das tabelas (antes só existia em prisma/sql/create_espelho_nf_tables.sql).
-- Produções que só usam `prisma migrate deploy` nunca criavam `espelho_nf_mirrors`, quebrando migrations seguintes.

CREATE TABLE IF NOT EXISTS "espelho_nf_service_providers" (
  "id" TEXT PRIMARY KEY,
  "cnpj" TEXT NOT NULL,
  "municipalRegistration" TEXT NOT NULL,
  "stateRegistration" TEXT NOT NULL,
  "corporateName" TEXT NOT NULL,
  "tradeName" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "email" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "espelho_nf_tax_codes" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "abatesMaterial" BOOLEAN NOT NULL DEFAULT false,
  "issRate" TEXT NOT NULL,
  "cofinsCollectionType" TEXT NOT NULL DEFAULT 'RETIDO',
  "csllCollectionType" TEXT NOT NULL DEFAULT 'RETIDO',
  "inssCollectionType" TEXT NOT NULL DEFAULT 'RETIDO',
  "irpjCollectionType" TEXT NOT NULL DEFAULT 'RETIDO',
  "pisCollectionType" TEXT NOT NULL DEFAULT 'RETIDO',
  "issCollectionType" TEXT NOT NULL DEFAULT 'RETIDO',
  "inssMaterialLimit" TEXT NOT NULL,
  "issMaterialLimit" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "espelho_nf_bank_accounts" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "bank" TEXT NOT NULL,
  "agency" TEXT NOT NULL,
  "account" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "espelho_nf_service_takers" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "cnpj" TEXT NOT NULL,
  "municipalRegistration" TEXT NOT NULL,
  "stateRegistration" TEXT NOT NULL,
  "corporateName" TEXT NOT NULL,
  "costCenterId" TEXT NOT NULL,
  "taxCodeId" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "municipality" TEXT,
  "city" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "contractRef" TEXT NOT NULL,
  "serviceDescription" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "espelho_nf_service_takers_costCenterId_fkey"
    FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "espelho_nf_service_takers_taxCodeId_fkey"
    FOREIGN KEY ("taxCodeId") REFERENCES "espelho_nf_tax_codes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "espelho_nf_service_takers_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "espelho_nf_bank_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "espelho_nf_mirrors" (
  "id" TEXT PRIMARY KEY,
  "measurementRef" TEXT NOT NULL,
  "costCenterId" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3),
  "municipality" TEXT,
  "cnae" TEXT,
  "serviceIssqn" TEXT,
  "empenhoNumber" TEXT,
  "processNumber" TEXT,
  "serviceOrder" TEXT,
  "measurementStartDate" TEXT,
  "measurementEndDate" TEXT,
  "buildingUnit" TEXT,
  "observations" TEXT,
  "notes" TEXT,
  "measurementAmount" TEXT NOT NULL,
  "laborAmount" TEXT NOT NULL,
  "materialAmount" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "takerId" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "taxCodeId" TEXT NOT NULL,
  "nfAttachmentName" TEXT,
  "nfAttachmentMimeType" TEXT,
  "nfAttachmentSize" INTEGER,
  "nfAttachmentDataUrl" TEXT,
  "xmlAttachmentName" TEXT,
  "xmlAttachmentMimeType" TEXT,
  "xmlAttachmentSize" INTEGER,
  "xmlAttachmentDataUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "espelho_nf_mirrors_costCenterId_fkey"
    FOREIGN KEY ("costCenterId") REFERENCES "cost_centers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "espelho_nf_mirrors_providerId_fkey"
    FOREIGN KEY ("providerId") REFERENCES "espelho_nf_service_providers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "espelho_nf_mirrors_takerId_fkey"
    FOREIGN KEY ("takerId") REFERENCES "espelho_nf_service_takers"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "espelho_nf_mirrors_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "espelho_nf_bank_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "espelho_nf_mirrors_taxCodeId_fkey"
    FOREIGN KEY ("taxCodeId") REFERENCES "espelho_nf_tax_codes"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "espelho_nf_service_providers_corporateName_idx"
  ON "espelho_nf_service_providers"("corporateName");
CREATE INDEX IF NOT EXISTS "espelho_nf_service_providers_cnpj_idx"
  ON "espelho_nf_service_providers"("cnpj");

CREATE INDEX IF NOT EXISTS "espelho_nf_tax_codes_name_idx"
  ON "espelho_nf_tax_codes"("name");

CREATE INDEX IF NOT EXISTS "espelho_nf_bank_accounts_name_idx"
  ON "espelho_nf_bank_accounts"("name");

CREATE INDEX IF NOT EXISTS "espelho_nf_service_takers_costCenterId_idx"
  ON "espelho_nf_service_takers"("costCenterId");
CREATE INDEX IF NOT EXISTS "espelho_nf_service_takers_taxCodeId_idx"
  ON "espelho_nf_service_takers"("taxCodeId");
CREATE INDEX IF NOT EXISTS "espelho_nf_service_takers_bankAccountId_idx"
  ON "espelho_nf_service_takers"("bankAccountId");
CREATE INDEX IF NOT EXISTS "espelho_nf_service_takers_corporateName_idx"
  ON "espelho_nf_service_takers"("corporateName");
CREATE INDEX IF NOT EXISTS "espelho_nf_service_takers_cnpj_idx"
  ON "espelho_nf_service_takers"("cnpj");

CREATE INDEX IF NOT EXISTS "espelho_nf_mirrors_costCenterId_idx"
  ON "espelho_nf_mirrors"("costCenterId");
CREATE INDEX IF NOT EXISTS "espelho_nf_mirrors_providerId_idx"
  ON "espelho_nf_mirrors"("providerId");
CREATE INDEX IF NOT EXISTS "espelho_nf_mirrors_takerId_idx"
  ON "espelho_nf_mirrors"("takerId");
CREATE INDEX IF NOT EXISTS "espelho_nf_mirrors_bankAccountId_idx"
  ON "espelho_nf_mirrors"("bankAccountId");
CREATE INDEX IF NOT EXISTS "espelho_nf_mirrors_taxCodeId_idx"
  ON "espelho_nf_mirrors"("taxCodeId");
CREATE INDEX IF NOT EXISTS "espelho_nf_mirrors_createdAt_idx"
  ON "espelho_nf_mirrors"("createdAt");
