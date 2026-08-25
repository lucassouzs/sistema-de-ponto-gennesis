import { prisma } from './prisma';

/** Remove acentos e normaliza caixa para buscas tolerantes (ex.: "antonio" encontra "Antônio"). */
export function normalizeSearchText(value: string | null | undefined): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function likePattern(normalizedQuery: string): string {
  return `%${normalizedQuery.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')}%`;
}

let unaccentReady: Promise<void> | null = null;

async function ensureUnaccentExtension(): Promise<void> {
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
