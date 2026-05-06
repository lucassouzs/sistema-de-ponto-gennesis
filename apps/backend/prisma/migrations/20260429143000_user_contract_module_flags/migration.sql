-- Recursos por contrato na tela de Permissões (orçamento, relatórios, OS, produção semanal).
ALTER TABLE "user_contract_permissions"
  ADD COLUMN IF NOT EXISTS "accessOrcamento"       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "accessRelatorios"      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "accessOrdemServico"    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "accessProducaoSemanal" BOOLEAN NOT NULL DEFAULT true;

-- Map contractId -> { orcamento, relatorios, ordemServico, producaoSemanal } para templates de cargo.
ALTER TABLE "position_permission_templates"
  ADD COLUMN IF NOT EXISTS "contractModuleFlags" JSONB NOT NULL DEFAULT '{}';
