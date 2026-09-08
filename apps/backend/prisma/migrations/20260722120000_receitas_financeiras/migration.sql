-- CreateTable
CREATE TABLE "receitas_financeiras" (
    "id" TEXT NOT NULL,
    "consorcio" TEXT NOT NULL,
    "mes" TEXT NOT NULL,
    "nf" TEXT NOT NULL,
    "faturamento" DECIMAL(15,2),
    "recebimentoLiquido" DECIMAL(15,2),
    "status" TEXT NOT NULL,
    "statusData" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receitas_financeiras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repasses_financeiros" (
    "id" TEXT NOT NULL,
    "consorcio" TEXT NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "parcela" TEXT NOT NULL,
    "dataEmissao" TEXT,
    "boleto" TEXT,
    "data" TEXT,
    "valorOriginal" DECIMAL(15,2) NOT NULL,
    "oc" TEXT,
    "valorFinal" DECIMAL(15,2) NOT NULL,
    "pagamento" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repasses_financeiros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receitas_financeiras_consorcio_idx" ON "receitas_financeiras"("consorcio");

-- CreateIndex
CREATE INDEX "receitas_financeiras_consorcio_mes_idx" ON "receitas_financeiras"("consorcio", "mes");

-- CreateIndex
CREATE INDEX "receitas_financeiras_status_idx" ON "receitas_financeiras"("status");

-- CreateIndex
CREATE INDEX "repasses_financeiros_consorcio_idx" ON "repasses_financeiros"("consorcio");

-- CreateIndex
CREATE INDEX "repasses_financeiros_fornecedor_idx" ON "repasses_financeiros"("fornecedor");
