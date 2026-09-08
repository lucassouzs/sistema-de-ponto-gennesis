ALTER TABLE "user_contract_permissions"
  ADD COLUMN IF NOT EXISTS "accessRecebimentoEntregas" BOOLEAN NOT NULL DEFAULT false;
