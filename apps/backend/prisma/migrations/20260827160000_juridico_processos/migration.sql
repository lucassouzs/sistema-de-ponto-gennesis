-- Processos trabalhistas importados da planilha de Controle Jurídico
CREATE TABLE IF NOT EXISTS "juridico_processos" (
  "id" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "numeroProcesso" TEXT NOT NULL,
  "tribunal" TEXT,
  "vara" TEXT,
  "reclamante" TEXT NOT NULL,
  "dataAudiencia" TEXT,
  "horario" TEXT,
  "presencial" TEXT,
  "statusProcesso" TEXT,
  "decisaoStf" TEXT,
  "polo" TEXT,
  "empresa" TEXT,
  "objeto" TEXT,
  "objeto2" TEXT,
  "contrato" TEXT,
  "funcao" TEXT,
  "regimeContratacao" TEXT,
  "periodo" TEXT,
  "periodoInicio" TEXT,
  "periodoFim" TEXT,
  "representanteAutor" TEXT,
  "acordo" TEXT,
  "valorCausa" DECIMAL(14, 2),
  "statusSentenca" TEXT,
  "valorSentenca" DECIMAL(14, 2),
  "valorRO" DECIMAL(14, 2),
  "valorRR" DECIMAL(14, 2),
  "valorCustas" DECIMAL(14, 2),
  "valorAcordo" DECIMAL(14, 2),
  "valorPagoSentenciado" DECIMAL(14, 2),
  "valorParcela" DECIMAL(14, 2),
  "valorPago" DECIMAL(14, 2),
  "numParcelas" INTEGER,
  "custas" DECIMAL(14, 2),
  "previdencia" DECIMAL(14, 2),
  "outrosGastos" DECIMAL(14, 2),
  "status" TEXT,
  "dataAcordo" TEXT,
  "dataAbertura" TEXT,
  "agravoInstrumento" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "juridico_processos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "juridico_processos_externalId_key"
  ON "juridico_processos"("externalId");
CREATE INDEX IF NOT EXISTS "juridico_processos_numeroProcesso_idx"
  ON "juridico_processos"("numeroProcesso");
CREATE INDEX IF NOT EXISTS "juridico_processos_reclamante_idx"
  ON "juridico_processos"("reclamante");
CREATE INDEX IF NOT EXISTS "juridico_processos_status_idx"
  ON "juridico_processos"("status");
CREATE INDEX IF NOT EXISTS "juridico_processos_statusProcesso_idx"
  ON "juridico_processos"("statusProcesso");
CREATE INDEX IF NOT EXISTS "juridico_processos_empresa_idx"
  ON "juridico_processos"("empresa");

CREATE TABLE IF NOT EXISTS "juridico_processo_anexos" (
  "id" TEXT NOT NULL,
  "processoId" TEXT NOT NULL,
  "externalId" TEXT,
  "originalName" TEXT NOT NULL,
  "sourcePath" TEXT,
  "fileUrl" TEXT,
  "fileKey" TEXT,
  "mimeType" TEXT,
  "size" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "juridico_processo_anexos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "juridico_processo_anexos_processoId_idx"
  ON "juridico_processo_anexos"("processoId");
CREATE INDEX IF NOT EXISTS "juridico_processo_anexos_externalId_idx"
  ON "juridico_processo_anexos"("externalId");

CREATE TABLE IF NOT EXISTS "juridico_processo_comprovantes" (
  "id" TEXT NOT NULL,
  "processoId" TEXT NOT NULL,
  "externalId" TEXT,
  "originalName" TEXT NOT NULL,
  "sourcePath" TEXT,
  "dataPagamento" TEXT,
  "fileUrl" TEXT,
  "fileKey" TEXT,
  "mimeType" TEXT,
  "size" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "juridico_processo_comprovantes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "juridico_processo_comprovantes_processoId_idx"
  ON "juridico_processo_comprovantes"("processoId");
CREATE INDEX IF NOT EXISTS "juridico_processo_comprovantes_externalId_idx"
  ON "juridico_processo_comprovantes"("externalId");

DO $$ BEGIN
  ALTER TABLE "juridico_processo_anexos"
    ADD CONSTRAINT "juridico_processo_anexos_processoId_fkey"
    FOREIGN KEY ("processoId") REFERENCES "juridico_processos"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "juridico_processo_comprovantes"
    ADD CONSTRAINT "juridico_processo_comprovantes_processoId_fkey"
    FOREIGN KEY ("processoId") REFERENCES "juridico_processos"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
