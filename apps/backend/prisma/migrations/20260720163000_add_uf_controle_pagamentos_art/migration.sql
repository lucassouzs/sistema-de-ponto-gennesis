-- AlterTable
ALTER TABLE "controle_pagamentos_art" ADD COLUMN "uf" TEXT;

-- CreateIndex
CREATE INDEX "controle_pagamentos_art_uf_idx" ON "controle_pagamentos_art"("uf");
