import { v4 as uuidv4 } from 'uuid';
import { getPrisma } from '../lib/prisma';
import {
  computeLicitacaoOrcamentoResult,
  normalizeLicitacaoOrcamentoInputs,
  type LicitacaoOrcamentoInputs,
  type LicitacaoOrcamentoResult,
} from '../lib/licitacaoOrcamentoCalc';

export type LicitacaoOrcamentoRecord = {
  id: string;
  licitacaoId: string;
  inputs: LicitacaoOrcamentoInputs;
  result: LicitacaoOrcamentoResult;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

type DbRow = {
  id: string;
  licitacaoId: string;
  inputsJson: unknown;
  resultJson: unknown;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function mapRow(row: DbRow): LicitacaoOrcamentoRecord {
  const inputs = normalizeLicitacaoOrcamentoInputs(row.inputsJson);
  const computed = computeLicitacaoOrcamentoResult(inputs);

  return {
    id: row.id,
    licitacaoId: row.licitacaoId,
    inputs,
    result: computed,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getLicitacaoOrcamentoByLicitacaoId(
  licitacaoId: string
): Promise<LicitacaoOrcamentoRecord | null> {
  const prisma = getPrisma();
  const rows = await prisma.$queryRaw<DbRow[]>`
    SELECT
      "id",
      "licitacaoId",
      "inputsJson",
      "resultJson",
      "createdBy",
      "updatedBy",
      "createdAt",
      "updatedAt"
    FROM "licitacao_orcamentos"
    WHERE "licitacaoId" = ${licitacaoId}
    LIMIT 1
  `;
  if (!rows[0]) return null;
  return mapRow(rows[0]);
}

export async function upsertLicitacaoOrcamento(params: {
  licitacaoId: string;
  inputs: unknown;
  userId: string;
}): Promise<LicitacaoOrcamentoRecord> {
  const prisma = getPrisma();
  const inputs = normalizeLicitacaoOrcamentoInputs(params.inputs);
  const result = computeLicitacaoOrcamentoResult(inputs);
  const now = new Date();
  const inputsJson = JSON.stringify(inputs);
  const resultJson = JSON.stringify(result);
  const existing = await getLicitacaoOrcamentoByLicitacaoId(params.licitacaoId);

  if (existing) {
    await prisma.$executeRaw`
      UPDATE "licitacao_orcamentos"
      SET
        "inputsJson" = ${inputsJson}::jsonb,
        "resultJson" = ${resultJson}::jsonb,
        "updatedBy" = ${params.userId},
        "updatedAt" = ${now}
      WHERE "licitacaoId" = ${params.licitacaoId}
    `;
  } else {
    const id = uuidv4();
    await prisma.$executeRaw`
      INSERT INTO "licitacao_orcamentos" (
        "id",
        "licitacaoId",
        "inputsJson",
        "resultJson",
        "createdBy",
        "updatedBy",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${id},
        ${params.licitacaoId},
        ${inputsJson}::jsonb,
        ${resultJson}::jsonb,
        ${params.userId},
        ${params.userId},
        ${now},
        ${now}
      )
    `;
  }

  const saved = await getLicitacaoOrcamentoByLicitacaoId(params.licitacaoId);
  if (!saved) {
    throw new Error('Falha ao gravar orçamento da licitação');
  }
  return saved;
}
