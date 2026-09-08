/**
 * Remove OS e contratos criados por criar-os-teste.ts (teste de carga).
 *
 * Padrões (mesmos do script original):
 *   - OS: descricao = "OS-TESTE-CARGA-01"
 *   - Contrato: number começa com "CARGA-TESTE-"
 *
 * Antes de deletar, bloqueia se houver RM/OC ou outras entidades reais vinculadas.
 * Rode limpar-dados-teste.ts --confirm antes, se ainda houver dados de carga.
 *
 * Uso:
 *   npx tsx scripts/remover-os-teste.ts           # dry-run
 *   npx tsx scripts/remover-os-teste.ts --confirm
 */

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

/** Mesmos valores de criar-os-teste.ts */
const TEST_OS_DESCRIPTION = 'OS-TESTE-CARGA-01';
const TEST_CONTRACT_PREFIX = 'CARGA-TESTE-';

const confirm = process.argv.includes('--confirm');

type CostCenterRef = {
  id: string;
  code: string;
  name: string;
};

function printDatabaseTarget(): void {
  const raw = process.env.DATABASE_URL || '';
  if (!raw) {
    console.error('DATABASE_URL não definida.');
    process.exitCode = 1;
    return;
  }
  try {
    const u = new URL(raw);
    console.log(`Banco alvo — host: ${u.hostname} | database: ${u.pathname.replace(/^\//, '')}`);
    if (/localhost|127\.0\.0\.1/i.test(u.hostname)) {
      console.log('  (ambiente aparenta ser LOCAL)');
    } else if (/railway|rlwy\.net/i.test(u.hostname)) {
      console.log('  (ambiente aparenta ser RAILWAY / produção)');
    }
  } catch {
    console.log('Banco alvo — DATABASE_URL definida (host não pôde ser parseado)');
  }
}

async function findTestServiceOrders() {
  return prisma.service_orders.findMany({
    where: { descricao: TEST_OS_DESCRIPTION },
    select: {
      id: true,
      numero: true,
      ano: true,
      descricao: true,
      costCenterId: true,
      cost_centers: { select: { id: true, code: true, name: true } },
      _count: { select: { material_requests: true, pleitos: true, cacambas: true } },
    },
    orderBy: [{ ano: 'desc' }, { numero: 'desc' }],
  });
}

async function findTestContracts() {
  return prisma.contract.findMany({
    where: { number: { startsWith: TEST_CONTRACT_PREFIX } },
    select: {
      id: true,
      number: true,
      name: true,
      costCenterId: true,
      costCenter: { select: { id: true, code: true, name: true } },
      _count: {
        select: {
          pleitos: true,
          billings: true,
          addenda: true,
          demandSheetApprovals: true,
          fuelRefuelRequests: true,
          materialDeliveries: true,
        },
      },
    },
    orderBy: [{ number: 'asc' }],
  });
}

async function collectBlockers(testOsIds: string[], testContractIds: string[]) {
  const blockers: string[] = [];

  if (testOsIds.length > 0) {
    const rms = await prisma.materialRequest.findMany({
      where: { serviceOrderId: { in: testOsIds } },
      select: {
        id: true,
        requestNumber: true,
        status: true,
        description: true,
        _count: { select: { purchaseOrders: true, quoteMaps: true } },
      },
      orderBy: { requestNumber: 'asc' },
      take: 20,
    });
    const rmTotal = await prisma.materialRequest.count({
      where: { serviceOrderId: { in: testOsIds } },
    });
    if (rmTotal > 0) {
      blockers.push(
        `${rmTotal} MaterialRequest(s) vinculada(s) às OS de teste. ` +
          'Rode: npx tsx scripts/limpar-dados-teste.ts --confirm',
      );
      for (const rm of rms.slice(0, 10)) {
        console.log(
          `  [RM bloqueadora] ${rm.requestNumber} [${rm.status}] ` +
            `OCs=${rm._count.purchaseOrders} QMs=${rm._count.quoteMaps} — ${(rm.description || '').slice(0, 60)}`,
        );
      }
      if (rmTotal > 10) console.log(`  ... e mais ${rmTotal - 10} RM(s)`);
    }

    const cacambasCount = await prisma.cacambas.count({
      where: { serviceOrderId: { in: testOsIds } },
    });
    if (cacambasCount > 0) {
      blockers.push(`${cacambasCount} caçamba(s) vinculada(s) às OS de teste (remova manualmente antes).`);
    }
  }

  if (testContractIds.length > 0) {
    const fds = await prisma.demandSheetApproval.findMany({
      where: { contratoId: { in: testContractIds } },
      select: { id: true, codFichaDemanda: true, status: true, contratoId: true },
      take: 10,
    });
    const fdTotal = await prisma.demandSheetApproval.count({
      where: { contratoId: { in: testContractIds } },
    });
    if (fdTotal > 0) {
      blockers.push(`${fdTotal} DemandSheetApproval(s) vinculada(s) aos contratos de teste.`);
      for (const fd of fds) {
        console.log(`  [FD bloqueadora] ${fd.codFichaDemanda} [${fd.status}] contrato=${fd.contratoId}`);
      }
    }

    const fuelTotal = await prisma.fuelRefuelRequest.count({
      where: { contractId: { in: testContractIds } },
    });
    if (fuelTotal > 0) {
      blockers.push(`${fuelTotal} FuelRefuelRequest(s) vinculada(s) aos contratos de teste.`);
    }
  }

  return blockers;
}

async function findContaminatedPleitos(testOsIds: string[], testContractIds: string[]) {
  if (testContractIds.length === 0) return [];
  return prisma.pleito.findMany({
    where: {
      updatedContractId: { in: testContractIds },
      ...(testOsIds.length > 0 ? { serviceOrderId: { notIn: testOsIds } } : {}),
    },
    select: {
      id: true,
      serviceOrderId: true,
      mes: true,
      ano: true,
      divSe: true,
      folderNumber: true,
      serviceDescription: true,
      updatedContractId: true,
    },
    orderBy: [{ ano: 'desc' }, { mes: 'desc' }],
  });
}

function formatCostCenter(cc: CostCenterRef): string {
  return `${cc.code} — ${cc.name}`;
}

async function main(): Promise<void> {
  console.log(confirm ? '=== MODO --confirm (vai deletar) ===' : '=== DRY-RUN (nada será deletado) ===');
  printDatabaseTarget();
  console.log(`\nPadrões: OS descricao="${TEST_OS_DESCRIPTION}" | contrato number^="${TEST_CONTRACT_PREFIX}"\n`);

  const testOrders = await findTestServiceOrders();
  const testContracts = await findTestContracts();

  const testOsIds = testOrders.map((o) => o.id);
  const testContractIds = testContracts.map((c) => c.id);

  console.log('=== CONTAGEM (seria removido) ===');
  console.log(`  Ordens de Serviço (OS-TESTE-CARGA-01): ${testOrders.length}`);
  console.log(`  Contratos (CARGA-TESTE-*):              ${testContracts.length}`);

  const pleitosOnTestOs = testOrders.reduce((sum, o) => sum + o._count.pleitos, 0);
  console.log(`  Pleitos nas OS de teste (cascade):     ${pleitosOnTestOs}`);

  const contaminatedPleitos = await findContaminatedPleitos(testOsIds, testContractIds);
  console.log(
    `  Pleitos em OS reais com contrato teste (reverter link): ${contaminatedPleitos.length}`,
  );

  if (testOrders.length === 0 && testContracts.length === 0) {
    console.log('\nNenhuma OS/contrato de teste encontrado. Script idempotente — nada a fazer.');
    return;
  }

  console.log('\nPrévia OS de teste (até 15):');
  for (const os of testOrders.slice(0, 15)) {
    const cc = os.cost_centers;
    console.log(
      `  OS #${os.numero}/${os.ano} [${os.id}] | CC: ${formatCostCenter(cc)} | ` +
        `RMs=${os._count.material_requests} pleitos=${os._count.pleitos}`,
    );
  }
  if (testOrders.length > 15) {
    console.log(`  ... e mais ${testOrders.length - 15} OS(s)`);
  }

  console.log('\nPrévia contratos de teste (até 15):');
  for (const c of testContracts.slice(0, 15)) {
    console.log(
      `  ${c.number} [${c.id}] | CC: ${formatCostCenter(c.costCenter)} | ` +
        `pleitos=${c._count.pleitos} FDs=${c._count.demandSheetApprovals}`,
    );
  }
  if (testContracts.length > 15) {
    console.log(`  ... e mais ${testContracts.length - 15} contrato(s)`);
  }

  const affectedCenters = new Map<string, CostCenterRef>();
  for (const os of testOrders) {
    affectedCenters.set(os.cost_centers.id, os.cost_centers);
  }
  for (const c of testContracts) {
    affectedCenters.set(c.costCenter.id, c.costCenter);
  }

  console.log(`\nCentros de custo afetados: ${affectedCenters.size}`);
  const sortedCenters = [...affectedCenters.values()].sort((a, b) => a.code.localeCompare(b.code));
  for (const cc of sortedCenters.slice(0, 20)) {
    console.log(`  - ${formatCostCenter(cc)}`);
  }
  if (sortedCenters.length > 20) {
    console.log(`  ... e mais ${sortedCenters.length - 20} centro(s)`);
  }

  console.log('\n=== VERIFICAÇÃO DE BLOQUEIOS (RM/OC/outros) ===');
  const blockers = await collectBlockers(testOsIds, testContractIds);
  if (blockers.length > 0) {
    console.error('\n❌ Remoção BLOQUEADA:');
    for (const b of blockers) {
      console.error(`  - ${b}`);
    }
    console.error(
      '\nResolva os vínculos acima antes de rodar com --confirm. ' +
        'Para dados de carga k6: npx tsx scripts/limpar-dados-teste.ts --confirm',
    );
    process.exitCode = 1;
    return;
  }
  console.log('  Nenhum bloqueio encontrado (sem RM/OC/FD/fuel nas entidades de teste).');

  if (!confirm) {
    console.log('\nOrdem de exclusão (--confirm):');
    console.log('  1. Reverter updatedContractId em pleitos de OS reais (se houver contaminação)');
    console.log('  2. Deletar service_orders OS-TESTE-CARGA-01 (+ pleitos em cascade)');
    console.log('  3. Deletar contratos CARGA-TESTE-* (+ aditivos/faturamentos em cascade)');
    console.log('\nDry-run concluído. Para deletar de fato:');
    console.log('  npx tsx scripts/remover-os-teste.ts --confirm');
    return;
  }

  let revertedPleitos = 0;
  if (contaminatedPleitos.length > 0) {
    const revertResult = await prisma.pleito.updateMany({
      where: {
        id: { in: contaminatedPleitos.map((p) => p.id) },
        updatedContractId: { in: testContractIds },
      },
      data: { updatedContractId: null },
    });
    revertedPleitos = revertResult.count;
    console.log(`\nPleitos com link revertido (updatedContractId=null): ${revertedPleitos}`);
  }

  let deletedOs = 0;
  if (testOsIds.length > 0) {
    const osResult = await prisma.service_orders.deleteMany({
      where: { id: { in: testOsIds }, descricao: TEST_OS_DESCRIPTION },
    });
    deletedOs = osResult.count;
  }

  let deletedContracts = 0;
  if (testContractIds.length > 0) {
    const contractResult = await prisma.contract.deleteMany({
      where: { id: { in: testContractIds }, number: { startsWith: TEST_CONTRACT_PREFIX } },
    });
    deletedContracts = contractResult.count;
  }

  console.log('\n=== DELETADO ===');
  console.log(`  Ordens de Serviço:  ${deletedOs}`);
  console.log(`  Contratos:          ${deletedContracts}`);
  console.log(`  Pleitos revertidos: ${revertedPleitos} (contaminação em OS reais)`);
  console.log(`  Centros de custo liberados: ${affectedCenters.size}`);

  const remainingOs = await prisma.service_orders.count({
    where: { descricao: TEST_OS_DESCRIPTION },
  });
  const remainingContracts = await prisma.contract.count({
    where: { number: { startsWith: TEST_CONTRACT_PREFIX } },
  });
  if (remainingOs > 0 || remainingContracts > 0) {
    console.warn(
      `\n⚠ Ainda restam OS=${remainingOs} contratos=${remainingContracts}. Revise manualmente.`,
    );
    process.exitCode = 1;
  } else {
    console.log('\n✓ Reversão concluída — nenhuma OS/contrato de teste restante no banco.');
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Erro em remover-os-teste:', message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
