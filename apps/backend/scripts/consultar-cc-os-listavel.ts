/**
 * Consulta read-only: centros de custo com OS listável (mesmo critério da API).
 *
 * Uso:
 *   npx tsx scripts/consultar-cc-os-listavel.ts "ADMINISTRAÇÃO CENTRAL" "FHE - DF"
 *
 * Materiais ativos (escolher MATERIAL_ID):
 *   npx tsx scripts/consultar-materiais-ativos.ts
 */

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

function printDatabaseTarget(): void {
  const raw = process.env.DATABASE_URL || '';
  if (!raw) {
    console.error('DATABASE_URL não definida.');
    return;
  }
  try {
    const u = new URL(raw);
    console.log(`Banco — host: ${u.hostname} | database: ${u.pathname.replace(/^\//, '')}`);
  } catch {
    console.log('Banco — DATABASE_URL definida');
  }
}

async function listListableOs(costCenterId: string) {
  return prisma.service_orders.findMany({
    where: {
      costCenterId,
      pleitos: { some: { updatedContractId: { not: null } } },
    },
    orderBy: [{ ano: 'desc' }, { numero: 'desc' }],
    select: {
      id: true,
      numero: true,
      ano: true,
      status: true,
      descricao: true,
      pleitos: {
        where: { updatedContractId: { not: null } },
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: {
          divSe: true,
          folderNumber: true,
          updatedContract: { select: { id: true, number: true, name: true } },
        },
      },
    },
  });
}

async function main(): Promise<void> {
  const names = process.argv.slice(2);
  const materialId = process.env.MATERIAL_ID || 'cmr0wp8qf000n47fczdmn8ybb';
  if (names.length === 0) {
    console.error('Informe nomes: npx tsx scripts/consultar-cc-os-listavel.ts "CC1" "CC2"');
    process.exitCode = 1;
    return;
  }

  printDatabaseTarget();
  console.log('Critério OS listável: pleito com updatedContractId != null\n');

  const material = await prisma.engineeringMaterial.findUnique({
    where: { id: materialId },
    select: { id: true, name: true, isActive: true, sinapiCode: true },
  });
  console.log('=== MATERIAL (RM) ===');
  if (!material || !material.isActive) {
    console.log(`  ⚠ MATERIAL_ID=${materialId} não encontrado ou inativo neste banco`);
  } else {
    console.log(
      `  OK — ${material.id} | ${material.name} | sinapi=${material.sinapiCode ?? '-'} | ativo=${material.isActive}`,
    );
  }
  console.log('');

  for (const name of names) {
    console.log(`=== ${name} ===`);
    const ccs = await prisma.costCenter.findMany({
      where: {
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          { name: { contains: name, mode: 'insensitive' } },
          { code: { equals: name, mode: 'insensitive' } },
        ],
      },
      select: { id: true, code: true, name: true, isActive: true },
      orderBy: [{ name: 'asc' }],
    });

    const exact = ccs.filter((c) => c.name.toLowerCase() === name.toLowerCase());
    const matches = exact.length > 0 ? exact : ccs;

    if (matches.length === 0) {
      const tokens = name.replace(/[^\w\s-]/g, ' ').split(/\s+/).filter((t) => t.length >= 3);
      const partial = tokens.length
        ? await prisma.costCenter.findMany({
            where: {
              OR: tokens.flatMap((t) => [
                { name: { contains: t, mode: 'insensitive' } },
                { code: { contains: t, mode: 'insensitive' } },
              ]),
            },
            select: { id: true, code: true, name: true, isActive: true },
            take: 12,
          })
        : [];
      console.log('  NÃO encontrado (nome exato). Sugestões parciais:');
      for (const p of partial) console.log(`    - ${p.code} | ${p.name} | id=${p.id}`);
      console.log('');
      continue;
    }

    for (const cc of matches) {
      const orders = await listListableOs(cc.id);
      console.log(`  costCenterId: ${cc.id}`);
      console.log(`  code: ${cc.code} | ativo: ${cc.isActive}`);
      console.log(`  OS listáveis: ${orders.length}`);
      if (orders.length === 0) {
        console.log('  ⚠ Sem OS listável — RM não pode ser criada neste CC.');
      } else {
        const first = orders[0];
        const pleito = first.pleitos[0];
        console.log(`  serviceOrderId (primeira da API): ${first.id}`);
        console.log(`  OS: ${first.numero}/${first.ano} [${first.status}] — ${first.descricao ?? ''}`);
        if (pleito?.updatedContract) {
          console.log(
            `  contrato: ${pleito.updatedContract.number} — ${pleito.updatedContract.name}`,
          );
        }
        if (orders.length > 1) {
          console.log(`  (+ ${orders.length - 1} outra(s) OS listável(is))`);
        }
      }
      console.log('');
    }
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
