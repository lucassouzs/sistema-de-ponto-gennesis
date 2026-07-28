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

/** Quantidade de licitações PNCP que o usuário enviou para a área de Licitações. */
export async function countPncpEnviadosByUser(
  userId: string,
  day?: string | null
): Promise<number> {
  const id = String(userId || '').trim();
  if (!id) return 0;

  const dayTrim = String(day || '').trim();
  if (dayTrim && /^\d{4}-\d{2}-\d{2}$/.test(dayTrim)) {
    // Dia civil em America/Sao_Paulo (sem horário de verão desde 2019).
    const from = new Date(`${dayTrim}T00:00:00.000-03:00`);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    if (!Number.isNaN(from.getTime())) {
      const rows = await getPrisma().$queryRaw<Array<{ total: bigint | number }>>`
        SELECT COUNT(*)::int AS total
        FROM pncp_enviados_analise e
        WHERE e."enviadoBy" = ${id}
          AND e."enviadoAt" >= ${from}
          AND e."enviadoAt" < ${to}
      `;
      const total = rows[0]?.total;
      return typeof total === 'bigint' ? Number(total) : Number(total || 0);
    }
  }

  const rows = await getPrisma().$queryRaw<Array<{ total: bigint | number }>>`
    SELECT COUNT(*)::int AS total
    FROM pncp_enviados_analise e
    WHERE e."enviadoBy" = ${id}
  `;
  const total = rows[0]?.total;
  return typeof total === 'bigint' ? Number(total) : Number(total || 0);
}

const WEEKDAY_LABELS_PT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'] as const;

export type PncpEnviosWeekdayCount = {
  date: string;
  label: string;
  total: number;
};

/** Segunda (YYYY-MM-DD) da semana civil que contém `dayYmd` (America/Sao_Paulo). */
export function resolveMondayYmd(dayYmd?: string | null): string {
  const raw = String(dayYmd || '').trim();
  let y: number;
  let m: number;
  let d: number;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parts = raw.split('-').map(Number);
    y = parts[0];
    m = parts[1];
    d = parts[2];
  } else {
    const sp = new Date().toLocaleDateString('en-CA', {
      timeZone: 'America/Sao_Paulo',
    });
    const parts = sp.split('-').map(Number);
    y = parts[0];
    m = parts[1];
    d = parts[2];
  }

  const localNoon = new Date(y, m - 1, d, 12, 0, 0, 0);
  const dow = localNoon.getDay(); // 0=dom … 1=seg
  const offsetToMon = dow === 0 ? -6 : 1 - dow;
  localNoon.setDate(localNoon.getDate() + offsetToMon);
  const yy = localNoon.getFullYear();
  const mm = String(localNoon.getMonth() + 1).padStart(2, '0');
  const dd = String(localNoon.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Contagem de envios PNCP do usuário de segunda a sexta da semana
 * (semana definida pela segunda informada ou a semana atual em SP).
 */
export async function countPncpEnviadosByUserWeekdays(
  userId: string,
  mondayOrAnyDay?: string | null
): Promise<{ monday: string; friday: string; days: PncpEnviosWeekdayCount[] }> {
  const id = String(userId || '').trim();
  const monday = resolveMondayYmd(mondayOrAnyDay);

  const ymdPlusDays = (ymd: string, delta: number): string => {
    const [y, m, d] = ymd.split('-').map(Number);
    const date = new Date(y, m - 1, d + delta, 12, 0, 0, 0);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };

  const friday = ymdPlusDays(monday, 4);

  const emptyDays: PncpEnviosWeekdayCount[] = WEEKDAY_LABELS_PT.map((label, i) => ({
    date: ymdPlusDays(monday, i),
    label,
    total: 0,
  }));

  if (!id) {
    return { monday, friday, days: emptyDays };
  }

  const from = new Date(`${monday}T00:00:00.000-03:00`);
  const to = new Date(`${ymdPlusDays(friday, 1)}T00:00:00.000-03:00`);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { monday, friday, days: emptyDays };
  }

  const rows = await getPrisma().$queryRaw<
    Array<{ day: Date | string; total: bigint | number }>
  >`
    SELECT (e."enviadoAt" AT TIME ZONE 'America/Sao_Paulo')::date AS day,
           COUNT(*)::int AS total
    FROM pncp_enviados_analise e
    WHERE e."enviadoBy" = ${id}
      AND e."enviadoAt" >= ${from}
      AND e."enviadoAt" < ${to}
    GROUP BY 1
    ORDER BY 1
  `;

  const byDay = new Map<string, number>();
  for (const row of rows) {
    let key: string;
    if (row.day instanceof Date) {
      const y = row.day.getUTCFullYear();
      const m = String(row.day.getUTCMonth() + 1).padStart(2, '0');
      const d = String(row.day.getUTCDate()).padStart(2, '0');
      key = `${y}-${m}-${d}`;
    } else {
      key = String(row.day).slice(0, 10);
    }
    const total = typeof row.total === 'bigint' ? Number(row.total) : Number(row.total || 0);
    byDay.set(key, total);
  }

  const days = emptyDays.map((day) => ({
    ...day,
    total: byDay.get(day.date) ?? 0,
  }));

  return { monday, friday, days };
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
