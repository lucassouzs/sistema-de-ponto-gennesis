-- CreateTable
CREATE TABLE "licitacoes" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "numeroProcesso" TEXT,
    "orgao" TEXT,
    "modalidade" TEXT,
    "status" TEXT NOT NULL DEFAULT 'RASCUNHO',
    "objeto" TEXT,
    "valorEstimado" TEXT,
    "vigenciaContrato" TEXT,
    "analiseJson" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "licitacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licitacao_documentos" (
    "id" TEXT NOT NULL,
    "licitacaoId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licitacao_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "licitacoes_createdBy_idx" ON "licitacoes"("createdBy");

-- CreateIndex
CREATE INDEX "licitacoes_status_idx" ON "licitacoes"("status");

-- CreateIndex
CREATE INDEX "licitacoes_createdAt_idx" ON "licitacoes"("createdAt");

-- CreateIndex
CREATE INDEX "licitacao_documentos_licitacaoId_idx" ON "licitacao_documentos"("licitacaoId");

-- AddForeignKey
ALTER TABLE "licitacoes" ADD CONSTRAINT "licitacoes_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licitacao_documentos" ADD CONSTRAINT "licitacao_documentos_licitacaoId_fkey" FOREIGN KEY ("licitacaoId") REFERENCES "licitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
