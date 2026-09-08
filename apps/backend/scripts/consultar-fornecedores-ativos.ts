/**
 * Consulta read-only: fornecedores ativos (Supplier) para escolher SUPPLIER_ID em carga k6.
 *
 * Uso:
 *   npx tsx scripts/consultar-fornecedores-ativos.ts
 *   LIMIT=20 npx tsx scripts/consultar-fornecedores-ativos.ts
 */

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 50;

function printDatabaseTarget(): void {
  const raw = process.env.DATABASE_URL || '';
  if (!raw) {
    console.error('DATABASE_URL não definida.');
    process.exitCode = 1;
    return;
  }
  try {
    const u = new URL(raw);
    console.log(`Banco — host: ${u.hostname} | database: ${u.pathname.replace(/^\//, '')}`);
    if (/localhost|127\.0\.0\.1/i.test(u.hostname)) {
      console.log('  (ambiente aparenta ser LOCAL)');
    } else if (/railway|rlwy\.net/i.test(u.hostname)) {
      console.log('  (ambiente aparenta ser RAILWAY / produção)');
    }
  } catch {
    console.log('Banco — DATABASE_URL definida');
  }
}

function parseLimit(): number {
  const raw = process.env.LIMIT || process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const n = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
}

function formatName(s: { code: string; name: string; tradeName: string | null }): string {
  const base = s.tradeName?.trim() || s.name?.trim() || '(sem nome)';
  return `${s.code} — ${base}`;
}

async function main(): Promise<void> {
  const limit = parseLimit();
  printDatabaseTarget();
  console.log(`\nFornecedores ativos (Supplier) — primeiros ${limit} por code\n`);

  const [suppliers, totalActive] = await Promise.all([
    prisma.supplier.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        tradeName: true,
        cnpj: true,
        city: true,
        state: true,
      },
      orderBy: [{ code: 'asc' }],
      take: limit,
    }),
    prisma.supplier.count({ where: { isActive: true } }),
  ]);

  if (suppliers.length === 0) {
    console.log('Nenhum fornecedor ativo encontrado neste banco.');
    return;
  }

  console.log(`Total ativos no banco: ${totalActive}`);
  console.log('─'.repeat(110));
  console.log(
    `${'#'.padStart(3)}  ${'id'.padEnd(28)}  ${'nome (código — fantasia/razão)'.padEnd(55)}  cnpj`,
  );
  console.log('─'.repeat(110));

  suppliers.forEach((s, i) => {
    const label = formatName(s).slice(0, 55);
    const cnpj = (s.cnpj || '-').slice(0, 18);
    console.log(`${String(i + 1).padStart(3)}  ${s.id.padEnd(28)}  ${label.padEnd(55)}  ${cnpj}`);
  });

  console.log('─'.repeat(110));
  console.log('\nUse no k6 / pipeline: $env:SUPPLIER_ID = "<id da linha escolhida>"');
  if (totalActive > limit) {
    console.log(`(mostrando ${limit} de ${totalActive} — aumente com LIMIT=20 ou --limit=20)`);
  }
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
