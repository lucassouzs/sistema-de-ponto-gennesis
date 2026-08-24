CREATE TABLE IF NOT EXISTS "nfe_recebidas" (
    "id" TEXT NOT NULL,
    "chave_acesso" TEXT,
    "nsu" TEXT NOT NULL,
    "schema" TEXT,
    "numero" TEXT,
    "serie" TEXT,
    "emit_cnpj" TEXT,
    "emit_nome" TEXT,
    "destinatario_cnpj" TEXT,
    "valor" DECIMAL(18,2),
    "data_emissao" TIMESTAMP(3),
    "xml_file_name" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "nfe_recebidas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "nfe_recebidas_chave_acesso_key" ON "nfe_recebidas"("chave_acesso");
CREATE INDEX IF NOT EXISTS "nfe_recebidas_nsu_idx" ON "nfe_recebidas"("nsu");
CREATE INDEX IF NOT EXISTS "nfe_recebidas_data_emissao_idx" ON "nfe_recebidas"("data_emissao");
CREATE INDEX IF NOT EXISTS "nfe_recebidas_emit_cnpj_idx" ON "nfe_recebidas"("emit_cnpj");
CREATE INDEX IF NOT EXISTS "nfe_recebidas_fetched_at_idx" ON "nfe_recebidas"("fetched_at");

CREATE TABLE IF NOT EXISTS "nfe_distribuicao_state" (
    "id" TEXT NOT NULL,
    "ultimo_nsu" TEXT NOT NULL DEFAULT '000000000000000',
    "last_fetch_at" TIMESTAMP(3),
    "last_message" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "nfe_distribuicao_state_pkey" PRIMARY KEY ("id")
);
