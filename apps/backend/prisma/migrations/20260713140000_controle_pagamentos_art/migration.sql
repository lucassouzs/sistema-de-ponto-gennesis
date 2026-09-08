-- CreateTable
CREATE TABLE "controle_pagamentos_art" (
    "id" TEXT NOT NULL,
    "empresa" TEXT,
    "contratante" TEXT,
    "cnpjCpf" TEXT,
    "contrato" TEXT,
    "observacoes" TEXT,
    "vigenciaInicio" TIMESTAMP(3),
    "vigenciaTermino" TIMESTAMP(3),
    "renovacao" TIMESTAMP(3),
    "art" TEXT,
    "valor" DECIMAL(14,2),
    "profissional" TEXT NOT NULL,
    "vencDoBoleto" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'EM_ABERTA',
    "pago" TEXT,
    "solicitaEm" TIMESTAMP(3),
    "pagoEm" TIMESTAMP(3),
    "fluig" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "controle_pagamentos_art_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "controle_pagamentos_art_empresa_idx" ON "controle_pagamentos_art"("empresa");

-- CreateIndex
CREATE INDEX "controle_pagamentos_art_contratante_idx" ON "controle_pagamentos_art"("contratante");

-- CreateIndex
CREATE INDEX "controle_pagamentos_art_cnpjCpf_idx" ON "controle_pagamentos_art"("cnpjCpf");

-- CreateIndex
CREATE INDEX "controle_pagamentos_art_contrato_idx" ON "controle_pagamentos_art"("contrato");

-- CreateIndex
CREATE INDEX "controle_pagamentos_art_art_idx" ON "controle_pagamentos_art"("art");

-- CreateIndex
CREATE INDEX "controle_pagamentos_art_profissional_idx" ON "controle_pagamentos_art"("profissional");

-- CreateIndex
CREATE INDEX "controle_pagamentos_art_status_idx" ON "controle_pagamentos_art"("status");
