-- Campos de cadastro: Código, Nome, Tipo do Produto, Natureza Orçamentária
ALTER TABLE "construction_materials" ADD COLUMN "code" TEXT;
ALTER TABLE "construction_materials" ADD COLUMN "productType" TEXT;
ALTER TABLE "construction_materials" ADD COLUMN "budgetNatureId" TEXT;

ALTER TABLE "construction_materials"
ADD CONSTRAINT "construction_materials_budgetNatureId_fkey"
FOREIGN KEY ("budgetNatureId") REFERENCES "budget_natures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "construction_materials_code_idx" ON "construction_materials"("code");
CREATE INDEX "construction_materials_budgetNatureId_idx" ON "construction_materials"("budgetNatureId");

-- Dados legados: código = antigo identificador em name; tipo = categoria antiga
UPDATE "construction_materials"
SET "code" = "name"
WHERE "code" IS NULL;

UPDATE "construction_materials"
SET "productType" = "category"
WHERE "productType" IS NULL AND "category" IS NOT NULL;
