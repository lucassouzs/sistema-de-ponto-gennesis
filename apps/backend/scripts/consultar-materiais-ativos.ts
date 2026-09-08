/**
 * Consulta read-only: materiais ativos (EngineeringMaterial) para escolher MATERIAL_ID em carga k6.
 *
 * Uso:
 *   npx tsx scripts/consultar-materiais-ativos.ts
 *   LIMIT=20 npx tsx scripts/consultar-materiais-ativos.ts
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

async function main(): Promise<void> {
  const limit = parseLimit();
  printDatabaseTarget();
  console.log(`\nMateriais ativos (EngineeringMaterial) — primeiros ${limit} por sinapiCode\n`);

  const [materials, totalActive] = await Promise.all([
    prisma.engineeringMaterial.findMany({
      where: { isActive: true },
      select: {
        id: true,
        sinapiCode: true,
        name: true,
        description: true,
        unit: true,
      },
      orderBy: [{ sinapiCode: 'asc' }],
      take: limit,
    }),
    prisma.engineeringMaterial.count({ where: { isActive: true } }),
  ]);

  if (materials.length === 0) {
    console.log('Nenhum material ativo encontrado neste banco.');
    return;
  }

  console.log(`Total ativos no banco: ${totalActive}`);
  console.log('─'.repeat(100));
  console.log(
    `${'#'.padStart(3)}  ${'id'.padEnd(28)}  ${'código'.padEnd(14)}  ${'un'.padEnd(6)}  descrição`,
  );
  console.log('─'.repeat(100));

  materials.forEach((m, i) => {
    const label = (m.name?.trim() || m.description?.trim() || '(sem descrição)').slice(0, 70);
    console.log(
      `${String(i + 1).padStart(3)}  ${m.id.padEnd(28)}  ${m.sinapiCode.padEnd(14)}  ${m.unit.padEnd(6)}  ${label}`,
    );
  });

  console.log('─'.repeat(100));
  console.log('\nUse no k6: -e MATERIAL_ID=<id da linha escolhida>');
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
