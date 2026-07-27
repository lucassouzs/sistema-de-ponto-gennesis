import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

export type PncpEnviadoAnalise = {
  id: string;
  numeroControlePNCP: string;
  regiaoKey: string;
  rowKey: string;
  enviadoBy: string;
  enviadoByName: string;
  enviadoAt: Date;
};

type DbRow = {
  id: string;
  numeroControlePNCP: string;
  regiaoKey: string;
  rowKey: string;
  enviadoBy: string;
  enviadoByName: string;
  enviadoAt: Date;
};

function mapRow(row: DbRow): PncpEnviadoAnalise {
  return {
    id: row.id,
    numeroControlePNCP: row.numeroControlePNCP,
    regiaoKey: row.regiaoKey,
    rowKey: row.rowKey,
    enviadoBy: row.enviadoBy,
    enviadoByName: row.enviadoByName,
    enviadoAt: row.enviadoAt,
  };
}

export async function getPncpEnviadoAnaliseByNumero(
  numeroControlePNCP: string
): Promise<PncpEnviadoAnalise | null> {
  const rows = await getPrisma().$queryRaw<DbRow[]>`
    SELECT
      e.id,
      e."numeroControlePNCP",
      e."regiaoKey",
      e."rowKey",
      e."enviadoBy",
      COALESCE(u.name, e."enviadoBy") AS "enviadoByName",
      e."enviadoAt"
    FROM pncp_enviados_analise e
    LEFT JOIN users u ON u.id = e."enviadoBy"
    WHERE e."numeroControlePNCP" = ${numeroControlePNCP}
    LIMIT 1
  `;
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listPncpEnviadosAnaliseByNumeros(
  numeros: string[]
): Promise<Map<string, PncpEnviadoAnalise>> {
  const unique = Array.from(
    new Set(numeros.map((n) => String(n || '').trim()).filter(Boolean))
  );
  const map = new Map<string, PncpEnviadoAnalise>();
  if (unique.length === 0) return map;

  const rows = await getPrisma().$queryRaw<DbRow[]>`
    SELECT
      e.id,
      e."numeroControlePNCP",
      e."regiaoKey",
      e."rowKey",
      e."enviadoBy",
      COALESCE(u.name, e."enviadoBy") AS "enviadoByName",
      e."enviadoAt"
    FROM pncp_enviados_analise e
    LEFT JOIN users u ON u.id = e."enviadoBy"
    WHERE e."numeroControlePNCP" IN (${Prisma.join(unique)})
  `;

  for (const row of rows) {
    map.set(row.numeroControlePNCP, mapRow(row));
  }
  return map;
}

export async function listAllPncpEnviadoNumeros(): Promise<string[]> {
  const rows = await getPrisma().$queryRaw<Array<{ numeroControlePNCP: string }>>`
    SELECT e."numeroControlePNCP"
    FROM pncp_enviados_analise e
  `;
  return rows.map((row) => row.numeroControlePNCP).filter(Boolean);
}

export async function createPncpEnviadoAnalise(input: {
  numeroControlePNCP: string;
  regiaoKey: string;
  rowKey: string;
  enviadoBy: string;
}): Promise<PncpEnviadoAnalise> {
  const id = uuidv4();

  await getPrisma().$executeRaw`
    INSERT INTO pncp_enviados_analise (
      id, "numeroControlePNCP", "regiaoKey", "rowKey", "enviadoBy", "enviadoAt"
    ) VALUES (
      ${id},
      ${input.numeroControlePNCP},
      ${input.regiaoKey},
      ${input.rowKey},
      ${input.enviadoBy},
      CURRENT_TIMESTAMP
    )
  `;

  const created = await getPncpEnviadoAnaliseByNumero(input.numeroControlePNCP);
  if (!created) throw new Error('Falha ao registrar envio para análise.');
  return created;
}
