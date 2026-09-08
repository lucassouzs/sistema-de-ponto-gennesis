-- CreateTable
CREATE TABLE "controle_anuidades" (
    "id" TEXT NOT NULL,
    "pagosPelo" TEXT,
    "empresa" TEXT,
    "profissional" TEXT NOT NULL,
    "porqueDesconto" TEXT,
    "crea" TEXT,
    "cpfCnpj" TEXT,
    "valor" DECIMAL(14,2),
    "dataVencimento" TIMESTAMP(3),
    "dataParaPagamento" TIMESTAMP(3),
    "dataPagamento" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'EM_ABERTA',
    "fluig" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_anuidades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "controle_anuidades_profissional_idx" ON "controle_anuidades"("profissional");

-- CreateIndex
CREATE INDEX "controle_anuidades_empresa_idx" ON "controle_anuidades"("empresa");

-- CreateIndex
CREATE INDEX "controle_anuidades_crea_idx" ON "controle_anuidades"("crea");

-- CreateIndex
CREATE INDEX "controle_anuidades_cpfCnpj_idx" ON "controle_anuidades"("cpfCnpj");

-- CreateIndex
CREATE INDEX "controle_anuidades_status_idx" ON "controle_anuidades"("status");
