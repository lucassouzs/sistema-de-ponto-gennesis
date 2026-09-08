-- CreateTable
CREATE TABLE "extrato_caixa_filtros_salvos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "extrato_caixa_filtros_salvos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extrato_caixa_filtros_salvos_userId_idx" ON "extrato_caixa_filtros_salvos"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "extrato_caixa_filtros_salvos_userId_nome_key" ON "extrato_caixa_filtros_salvos"("userId", "nome");

-- AddForeignKey
ALTER TABLE "extrato_caixa_filtros_salvos" ADD CONSTRAINT "extrato_caixa_filtros_salvos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
