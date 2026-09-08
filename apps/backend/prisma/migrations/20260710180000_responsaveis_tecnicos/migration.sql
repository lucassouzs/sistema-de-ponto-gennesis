-- CreateTable
CREATE TABLE "responsaveis_tecnicos" (
    "id" TEXT NOT NULL,
    "crea" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "empresa" TEXT,
    "profissional" TEXT NOT NULL,
    "cpf" TEXT,
    "registro" TEXT,
    "dataInicio" TIMESTAMP(3),
    "titulo" TEXT,
    "artCargoFuncao" TEXT,
    "protocolo" TEXT,
    "baixaEm" TIMESTAMP(3),
    "anuidade2026" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "responsaveis_tecnicos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "responsaveis_tecnicos_crea_idx" ON "responsaveis_tecnicos"("crea");

-- CreateIndex
CREATE INDEX "responsaveis_tecnicos_profissional_idx" ON "responsaveis_tecnicos"("profissional");

-- CreateIndex
CREATE INDEX "responsaveis_tecnicos_cpf_idx" ON "responsaveis_tecnicos"("cpf");

-- CreateIndex
CREATE INDEX "responsaveis_tecnicos_status_idx" ON "responsaveis_tecnicos"("status");
