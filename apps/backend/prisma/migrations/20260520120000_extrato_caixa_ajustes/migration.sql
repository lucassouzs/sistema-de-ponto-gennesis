-- CreateTable
CREATE TABLE "extrato_caixa_ajustes" (
    "id" TEXT NOT NULL,
    "dataCompensacao" DATE NOT NULL,
    "codCCusto" TEXT NOT NULL DEFAULT '',
    "ccusto" TEXT NOT NULL DEFAULT '',
    "codNatFinanceira" TEXT NOT NULL DEFAULT '',
    "natureza" TEXT NOT NULL DEFAULT '',
    "codFilial" INTEGER,
    "fornecedor" TEXT NOT NULL DEFAULT '',
    "valor" DECIMAL(18,2) NOT NULL,
    "observacao" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extrato_caixa_ajustes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extrato_caixa_ajustes_dataCompensacao_idx" ON "extrato_caixa_ajustes"("dataCompensacao");

-- CreateIndex
CREATE INDEX "extrato_caixa_ajustes_codFilial_idx" ON "extrato_caixa_ajustes"("codFilial");
