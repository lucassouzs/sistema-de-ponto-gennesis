-- CreateEnum
CREATE TYPE "AsoGrauRisco" AS ENUM ('BAIXO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "AsoResultado" AS ENUM ('APTO', 'APTO_COM_RESTRICAO', 'INAPTO');

-- CreateTable
CREATE TABLE "tipos_aso" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tipos_aso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargos_risco" (
    "id" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "grauRisco" "AsoGrauRisco" NOT NULL DEFAULT 'MEDIO',
    "periodicidadeMeses" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cargos_risco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aso_registros" (
    "id" TEXT NOT NULL,
    "funcionarioId" TEXT NOT NULL,
    "tipoAsoId" TEXT NOT NULL,
    "dataExame" DATE NOT NULL,
    "dataValidade" DATE NOT NULL,
    "resultado" "AsoResultado" NOT NULL,
    "medicoResponsavel" TEXT NOT NULL,
    "crmMedico" TEXT NOT NULL,
    "clinica" TEXT NOT NULL,
    "anexoUrl" TEXT,
    "observacoes" TEXT,
    "validadePadrao" BOOLEAN NOT NULL DEFAULT false,
    "periodicidadeUsada" INTEGER NOT NULL,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aso_registros_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tipos_aso_nome_key" ON "tipos_aso"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "cargos_risco_cargo_key" ON "cargos_risco"("cargo");

-- CreateIndex
CREATE INDEX "cargos_risco_cargo_idx" ON "cargos_risco"("cargo");

-- CreateIndex
CREATE INDEX "aso_registros_funcionarioId_idx" ON "aso_registros"("funcionarioId");

-- CreateIndex
CREATE INDEX "aso_registros_tipoAsoId_idx" ON "aso_registros"("tipoAsoId");

-- CreateIndex
CREATE INDEX "aso_registros_dataValidade_idx" ON "aso_registros"("dataValidade");

-- CreateIndex
CREATE INDEX "aso_registros_resultado_idx" ON "aso_registros"("resultado");

-- CreateIndex
CREATE INDEX "aso_registros_createdAt_idx" ON "aso_registros"("createdAt");

-- AddForeignKey
ALTER TABLE "aso_registros" ADD CONSTRAINT "aso_registros_funcionarioId_fkey" FOREIGN KEY ("funcionarioId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aso_registros" ADD CONSTRAINT "aso_registros_tipoAsoId_fkey" FOREIGN KEY ("tipoAsoId") REFERENCES "tipos_aso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aso_registros" ADD CONSTRAINT "aso_registros_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed tipos ASO
INSERT INTO "tipos_aso" ("id", "nome", "createdAt", "updatedAt") VALUES
  ('aso_tipo_admissional', 'Admissional', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aso_tipo_periodico', 'Periódico', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aso_tipo_retorno', 'Retorno ao Trabalho', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aso_tipo_mudanca', 'Mudança de Função', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('aso_tipo_demissional', 'Demissional', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
