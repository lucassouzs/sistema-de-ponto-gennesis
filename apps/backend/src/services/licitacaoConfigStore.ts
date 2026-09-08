import { getPrisma } from '../lib/prisma';

const CHECKLIST_TEMPLATE_KEY = 'checklist_template';

export async function licitacaoConfigGet(key: string): Promise<unknown | null> {
  const rows = await getPrisma().$queryRaw<Array<{ value: unknown }>>`
    SELECT value FROM licitacao_config WHERE key = ${key} LIMIT 1
  `;
  return rows[0]?.value ?? null;
}

export async function licitacaoConfigSet(key: string, value: unknown): Promise<void> {
  const json = JSON.stringify(value);
  await getPrisma().$executeRawUnsafe(
    `INSERT INTO licitacao_config (key, value, "updatedAt")
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       "updatedAt" = NOW()`,
    key,
    json
  );
}

export { CHECKLIST_TEMPLATE_KEY };
