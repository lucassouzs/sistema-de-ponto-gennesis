import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/** Remove acentos e normaliza caixa para buscas tolerantes (ex.: "antonio" encontra "Antônio"). */
export function normalizeSearchText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** True se `haystack` contém `needle`, ignorando acentos e maiúsculas/minúsculas. */
export function textMatchesSearch(
  haystack: string | null | undefined,
  needle: string | null | undefined
): boolean {
  const q = normalizeSearchText(needle);
  if (!q) return true;
  return normalizeSearchText(haystack).includes(q);
}

export function likePattern(normalizedQuery: string): string {
  return `%${normalizedQuery.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
}

function assertSafeSqlIdentifier(expr: string): string {
  // Permite colunas simples, qualificadores e aspas duplas: name, bn.name, "productType", cm."productType"
  if (!/^[a-zA-Z_][a-zA-Z0-9_."]*$/.test(expr)) {
    throw new Error(`Identificador SQL inválido para busca: ${expr}`);
  }
  return expr;
}

let unaccentReady: Promise<void> | null = null;

export async function ensureUnaccentExtension(): Promise<void> {
  if (!unaccentReady) {
    unaccentReady = prisma
      .$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS unaccent`)
      .then(() => undefined)
      .catch((err) => {
        unaccentReady = null;
        throw err;
      });
  }
  await unaccentReady;
}

/**
 * Predicado SQL: lower(unaccent(col)) LIKE %termo% OR ...
 * Retorna null se o termo estiver vazio.
 */
export function unaccentIlikeOr(columns: string[], search: string): Prisma.Sql | null {
  const q = normalizeSearchText(search);
  if (!q) return null;
  const pattern = likePattern(q);
  const parts = columns.map((col) => {
    const safe = assertSafeSqlIdentifier(col);
    return Prisma.sql`lower(unaccent(coalesce(${Prisma.raw(safe)}::text, ''))) LIKE ${pattern} ESCAPE '\'`;
  });
  return Prisma.join(parts, ' OR ');
}

/**
 * IDs cujo texto em alguma das colunas bate com a busca (sem acento / caixa).
 * Retorna `null` se não houver termo de busca (sem filtro).
 */
export async function findIdsByUnaccentSearch(opts: {
  /** Trecho FROM, ex.: Prisma.sql`budget_natures` ou Prisma.sql`construction_materials cm` */
  from: Prisma.Sql;
  idColumn?: string;
  columns: string[];
  search: string;
  extraWhere?: Prisma.Sql;
}): Promise<string[] | null> {
  const predicate = unaccentIlikeOr(opts.columns, opts.search);
  if (!predicate) return null;

  await ensureUnaccentExtension();
  const idCol = assertSafeSqlIdentifier(opts.idColumn ?? 'id');
  const whereParts = [Prisma.sql`(${predicate})`];
  if (opts.extraWhere) whereParts.push(opts.extraWhere);

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT ${Prisma.raw(idCol)} AS id
    FROM ${opts.from}
    WHERE ${Prisma.join(whereParts, ' AND ')}
  `;
  return rows.map((r) => r.id);
}

/**
 * IDs de usuários cujo nome/e-mail/CPF/dados de employee batem com a busca
 * sem distinguir acentos nem maiúsculas.
 */
export async function findUserIdsMatchingSearch(search: string): Promise<string[]> {
  const q = normalizeSearchText(search);
  if (!q) return [];

  await ensureUnaccentExtension();
  const pattern = likePattern(q);

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT u.id
    FROM users u
    LEFT JOIN employees e ON e."userId" = u.id
    WHERE
      lower(unaccent(coalesce(u.name, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(u.email, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(u.cpf, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e."employeeId", ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.department, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.position, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.company, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.polo, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e."costCenter", ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.client, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e."categoriaFinanceira", ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.modality, ''))) LIKE ${pattern} ESCAPE '\'
  `;

  return rows.map((r) => r.id);
}

/** IDs de employees cujo nome do user ou dados do vínculo batem com a busca (sem acento). */
export async function findEmployeeIdsMatchingSearch(search: string): Promise<string[]> {
  const q = normalizeSearchText(search);
  if (!q) return [];

  await ensureUnaccentExtension();
  const pattern = likePattern(q);

  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT e.id
    FROM employees e
    INNER JOIN users u ON u.id = e."userId"
    WHERE
      lower(unaccent(coalesce(u.name, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(u.email, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(u.cpf, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e."employeeId", ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.department, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.position, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.company, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.polo, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e."costCenter", ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.client, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e."categoriaFinanceira", ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.modality, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.bank, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e."accountType", ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.agency, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e.account, ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e."pixKeyType", ''))) LIKE ${pattern} ESCAPE '\'
      OR lower(unaccent(coalesce(e."pixKey", ''))) LIKE ${pattern} ESCAPE '\'
  `;

  return rows.map((r) => r.id);
}
