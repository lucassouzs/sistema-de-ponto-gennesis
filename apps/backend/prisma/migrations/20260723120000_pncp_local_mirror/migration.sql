-- Espelho local PNCP + histórico de sync
CREATE TABLE IF NOT EXISTS "pncp_contratacoes" (
    "id" TEXT NOT NULL,
    "numeroControlePNCP" TEXT NOT NULL,
    "sequencialCompra" INTEGER,
    "processo" TEXT,
    "objeto" TEXT,
    "objetoNorm" TEXT,
    "orgao" TEXT,
    "cnpjOrgao" TEXT,
    "unidadeCompradora" TEXT,
    "codigoUnidadeCompradora" TEXT,
    "uf" TEXT NOT NULL,
    "municipio" TEXT,
    "modalidade" TEXT,
    "codigoModalidade" INTEGER NOT NULL,
    "situacao" TEXT,
    "modoDisputa" TEXT,
    "plataforma" TEXT,
    "srp" BOOLEAN,
    "valorEstimado" DOUBLE PRECISION,
    "valorHomologado" DOUBLE PRECISION,
    "dataInclusao" TIMESTAMP(3),
    "dataAberturaProposta" TIMESTAMP(3),
    "dataEncerramentoProposta" TIMESTAMP(3),
    "amparoLegal" TEXT,
    "linkSistemaOrigem" TEXT,
    "linkPncp" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pncp_contratacoes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pncp_contratacoes_numeroControlePNCP_key"
  ON "pncp_contratacoes"("numeroControlePNCP");

CREATE INDEX IF NOT EXISTS "pncp_contratacoes_uf_idx"
  ON "pncp_contratacoes"("uf");

CREATE INDEX IF NOT EXISTS "pncp_contratacoes_codigoModalidade_idx"
  ON "pncp_contratacoes"("codigoModalidade");

CREATE INDEX IF NOT EXISTS "pncp_contratacoes_dataInclusao_idx"
  ON "pncp_contratacoes"("dataInclusao");

CREATE INDEX IF NOT EXISTS "pncp_contratacoes_uf_codigoModalidade_dataInclusao_idx"
  ON "pncp_contratacoes"("uf", "codigoModalidade", "dataInclusao");

CREATE INDEX IF NOT EXISTS "pncp_contratacoes_syncedAt_idx"
  ON "pncp_contratacoes"("syncedAt");

CREATE TABLE IF NOT EXISTS "pncp_sync_runs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "lookbackDays" INTEGER NOT NULL,
    "pagesFetched" INTEGER NOT NULL DEFAULT 0,
    "upserted" INTEGER NOT NULL DEFAULT 0,
    "pruned" INTEGER NOT NULL DEFAULT 0,
    "rateLimitHits" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pncp_sync_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pncp_sync_runs_startedAt_idx"
  ON "pncp_sync_runs"("startedAt");

CREATE INDEX IF NOT EXISTS "pncp_sync_runs_status_idx"
  ON "pncp_sync_runs"("status");
