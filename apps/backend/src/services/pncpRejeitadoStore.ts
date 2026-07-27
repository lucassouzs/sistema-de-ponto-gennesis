import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { getPrisma } from '../lib/prisma';

export type PncpRejeitado = {
  id: string;
  numeroControlePNCP: string;
  rejeitadoBy: string;
  rejeitadoByName: string;
  rejeitadoAt: Date;
};

type DbRow = {
  id: string;
  numeroControlePNCP: string;
  rejeitadoBy: string;
  rejeitadoByName: string;
  rejeitadoAt: Date;
};

function mapRow(row: DbRow): PncpRejeitado {
  return {
    id: row.id,
    numeroControlePNCP: row.numeroControlePNCP,
    rejeitadoBy: row.rejeitadoBy,
    rejeitadoByName: row.rejeitadoByName,
    rejeitadoAt: row.rejeitadoAt,
  };
}

export async function getPncpRejeitadoByNumero(
  numeroControlePNCP: string
): Promise<PncpRejeitado | null> {
  const rows = await getPrisma().$queryRaw<DbRow[]>`
    SELECT
      r.id,
      r."numeroControlePNCP",
      r."rejeitadoBy",
      COALESCE(u.name, r."rejeitadoBy") AS "rejeitadoByName",
      r."rejeitadoAt"
    FROM pncp_rejeitados r
    LEFT JOIN users u ON u.id = r."rejeitadoBy"
    WHERE r."numeroControlePNCP" = ${numeroControlePNCP}
    LIMIT 1
  `;
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listPncpRejeitadosByNumeros(
  numeros: string[]
): Promise<Map<string, PncpRejeitado>> {
  const unique = Array.from(
    new Set(numeros.map((n) => String(n || '').trim()).filter(Boolean))
  );
  const map = new Map<string, PncpRejeitado>();
  if (unique.length === 0) return map;

  const rows = await getPrisma().$queryRaw<DbRow[]>`
    SELECT
      r.id,
      r."numeroControlePNCP",
      r."rejeitadoBy",
      COALESCE(u.name, r."rejeitadoBy") AS "rejeitadoByName",
      r."rejeitadoAt"
    FROM pncp_rejeitados r
    LEFT JOIN users u ON u.id = r."rejeitadoBy"
    WHERE r."numeroControlePNCP" IN (${Prisma.join(unique)})
  `;

  for (const row of rows) {
    map.set(row.numeroControlePNCP, mapRow(row));
  }
  return map;
}

export async function listAllPncpRejeitadoNumeros(): Promise<string[]> {
  const rows = await getPrisma().$queryRaw<Array<{ numeroControlePNCP: string }>>`
    SELECT r."numeroControlePNCP"
    FROM pncp_rejeitados r
  `;
  return rows.map((row) => row.numeroControlePNCP).filter(Boolean);
}

export async function createPncpRejeitado(input: {
  numeroControlePNCP: string;
  rejeitadoBy: string;
}): Promise<PncpRejeitado> {
  const id = uuidv4();

  await getPrisma().$executeRaw`
    INSERT INTO pncp_rejeitados (
      id, "numeroControlePNCP", "rejeitadoBy", "rejeitadoAt"
    ) VALUES (
      ${id},
      ${input.numeroControlePNCP},
      ${input.rejeitadoBy},
      CURRENT_TIMESTAMP
    )
  `;

  const created = await getPncpRejeitadoByNumero(input.numeroControlePNCP);
  if (!created) throw new Error('Falha ao registrar rejeição.');
  return created;
}

export async function deletePncpRejeitadoByNumero(numeroControlePNCP: string): Promise<void> {
  await getPrisma().$executeRaw`
    DELETE FROM pncp_rejeitados
    WHERE "numeroControlePNCP" = ${numeroControlePNCP}
  `;
}
