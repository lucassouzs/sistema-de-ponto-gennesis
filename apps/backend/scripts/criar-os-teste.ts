/**
 * Garante que cada centro de custo ativo tenha ao menos 1 OS listável pela API
 * (service_orders + pleito vinculado a contrato).
 *
 * Execute: npx tsx scripts/criar-os-teste.ts
 */

import 'dotenv/config';
import { randomUUID } from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { ServiceOrderStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma';

const TEST_OS_DESCRIPTION = 'OS-TESTE-CARGA-01';
const TEST_OS_NUMERO = 9001;
const TEST_CONTRACT_PREFIX = 'CARGA-TESTE-';

type CostCenterOsPair = {
  costCenterId: string;
  costCenterCode: string;
  costCenterName: string;
  serviceOrderId: string;
  created: boolean;
};

async function findListableServiceOrderId(costCenterId: string): Promise<string | null> {
  const row = await prisma.service_orders.findFirst({
    where: {
      costCenterId,
      pleitos: {
        some: {
          updatedContractId: { not: null },
        },
      },
    },
    orderBy: [{ ano: 'desc' }, { numero: 'desc' }],
    select: { id: true },
  });
  return row?.id ?? null;
}

async function ensureContractForCostCenter(costCenter: {
  id: string;
  code: string;
  name: string;
}): Promise<string> {
  const contractNumber = `${TEST_CONTRACT_PREFIX}${costCenter.code}`.slice(0, 80);

  const existing = await prisma.contract.findFirst({
    where: {
      costCenterId: costCenter.id,
      number: { startsWith: TEST_CONTRACT_PREFIX },
    },
    select: { id: true },
  });
  if (existing) return existing.id;

  const now = new Date();
  const startDate = new Date(now.getFullYear(), 0, 1);
  const endDate = new Date(now.getFullYear() + 2, 11, 31);

  const created = await prisma.contract.create({
    data: {
      name: `Contrato teste carga — ${costCenter.name}`.slice(0, 200),
      number: contractNumber,
      startDate,
      endDate,
      costCenterId: costCenter.id,
      valuePlusAddenda: new Decimal(100000),
    },
    select: { id: true },
  });

  return created.id;
}

async function ensurePleitoForServiceOrder(
  serviceOrderId: string,
  contractId: string,
): Promise<void> {
  const now = new Date();
  const mes = now.getMonth() + 1;
  const ano = now.getFullYear();

  const existing = await prisma.pleito.findFirst({
    where: {
      serviceOrderId,
      updatedContractId: contractId,
    },
    select: { id: true },
  });
  if (existing) return;

  const sameCompetence = await prisma.pleito.findUnique({
    where: {
      serviceOrderId_mes_ano: {
        serviceOrderId,
        mes,
        ano,
      },
    },
    select: { id: true, updatedContractId: true },
  });

  if (sameCompetence) {
    if (!sameCompetence.updatedContractId) {
      await prisma.pleito.update({
        where: { id: sameCompetence.id },
        data: { updatedContractId: contractId },
      });
    }
    return;
  }

  await prisma.pleito.create({
    data: {
      serviceOrderId,
      mes,
      ano,
      valorPrevisto: new Decimal(1000),
      serviceDescription: 'Pleito de teste para carga — suprimentos',
      updatedContractId: contractId,
      divSe: TEST_OS_DESCRIPTION,
      folderNumber: 'K6-LOAD',
      creationMonth: String(mes).padStart(2, '0'),
      creationYear: ano,
    },
  });
}

async function ensureTestServiceOrder(costCenter: {
  id: string;
  code: string;
  name: string;
}): Promise<{ serviceOrderId: string; created: boolean }> {
  const listableId = await findListableServiceOrderId(costCenter.id);
  if (listableId) {
    return { serviceOrderId: listableId, created: false };
  }

  const contractId = await ensureContractForCostCenter(costCenter);
  const ano = new Date().getFullYear();
  const now = new Date();

  let serviceOrder = await prisma.service_orders.findFirst({
    where: {
      costCenterId: costCenter.id,
      descricao: TEST_OS_DESCRIPTION,
      ano,
    },
    select: { id: true },
  });

  let created = false;

  if (!serviceOrder) {
    serviceOrder = await prisma.service_orders.create({
      data: {
        id: randomUUID(),
        costCenterId: costCenter.id,
        numero: TEST_OS_NUMERO,
        ano,
        dataInicio: new Date(ano, 0, 1),
        previsaoFim: new Date(ano, 11, 31),
        valor: new Decimal(1000),
        status: ServiceOrderStatus.EM_ANDAMENTO,
        descricao: TEST_OS_DESCRIPTION,
        justificativa: 'OS criada automaticamente para testes de carga (k6)',
        updatedAt: now,
      },
      select: { id: true },
    });
    created = true;
  }

  await ensurePleitoForServiceOrder(serviceOrder.id, contractId);

  const listableAfter = await findListableServiceOrderId(costCenter.id);
  if (!listableAfter) {
    throw new Error(
      `Falha ao tornar OS listável para o centro ${costCenter.code} (${costCenter.id})`,
    );
  }

  return { serviceOrderId: listableAfter, created };
}

async function main(): Promise<void> {
  console.log('Verificando centros de custo ativos e OS para teste de carga...\n');

  const costCenters = await prisma.costCenter.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true },
  });

  if (costCenters.length === 0) {
    console.log('Nenhum centro de custo ativo encontrado no banco.');
    return;
  }

  const pairs: CostCenterOsPair[] = [];

  for (const cc of costCenters) {
    const { serviceOrderId, created } = await ensureTestServiceOrder(cc);
    pairs.push({
      costCenterId: cc.id,
      costCenterCode: cc.code,
      costCenterName: cc.name,
      serviceOrderId,
      created,
    });
    const tag = created ? 'CRIADA' : 'OK';
    console.log(`  [${tag}] ${cc.code} — ${cc.name}`);
    console.log(`         centro: ${cc.id}`);
    console.log(`         OS:     ${serviceOrderId}\n`);
  }

  console.log('═'.repeat(60));
  console.log('Resumo — centros de custo com OS válida para a API:\n');
  console.log(JSON.stringify(pairs, null, 2));
  console.log(`\nTotal: ${pairs.length} centro(s) com OS listável.`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Erro ao criar OS de teste:', message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
