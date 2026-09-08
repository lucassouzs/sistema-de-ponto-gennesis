/**
 * Remove usuários de carga criados por criar-usuarios-teste.ts
 * (emails terminando em @loadtest.com, ex.: teste1@loadtest.com … teste30@loadtest.com).
 *
 * Antes de deletar, verifica vínculos que bloqueiam exclusão (FK Restrict) e
 * dados associados (RM, OC, QuoteMap, FinancialControl, etc.).
 *
 * Rode limpar-dados-teste.ts --confirm antes, se ainda houver dados de carga k6.
 *
 * Uso:
 *   npx tsx scripts/remover-usuarios-teste.ts           # dry-run
 *   npx tsx scripts/remover-usuarios-teste.ts --confirm
 */

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const EMAIL_SUFFIX = '@loadtest.com';
const confirm = process.argv.includes('--confirm');

type TestUser = {
  id: string;
  email: string;
  name: string;
  cpf: string;
  createdAt: Date;
  employee: { id: string; employeeId: string; department: string } | null;
};

type PrismaCountDelegate = {
  count: (args: { where: object }) => Promise<number>;
  findMany?: (args: object) => Promise<unknown[]>;
};

type BlockerCheck = {
  modelKey: string;
  label: string;
  hint?: string;
  where: (userIds: string[]) => object;
  sample?: (userIds: string[]) => Promise<void>;
};

type SoftLinkCheck = {
  modelKey?: string;
  label: string;
  count: (userIds: string[]) => Promise<number>;
};

/** Delegate Prisma (ex.: prisma.licitacao) — undefined se o client não foi regenerado. */
function getPrismaDelegate(modelKey: string): PrismaCountDelegate | undefined {
  const delegate = (prisma as unknown as Record<string, unknown>)[modelKey];
  if (!delegate || typeof delegate !== 'object') return undefined;
  const model = delegate as PrismaCountDelegate;
  return typeof model.count === 'function' ? model : undefined;
}

function isPrismaModelAvailable(modelKey: string): boolean {
  return getPrismaDelegate(modelKey) !== undefined;
}

/** Conta registros sem acessar .count em delegate undefined (causa do bug reportado). */
async function countWhere(modelKey: string, label: string, where: object): Promise<number> {
  const model = getPrismaDelegate(modelKey);
  if (!model) {
    console.warn(
      `  [aviso] Verificação ignorada (${label}): prisma.${modelKey} indisponível no Prisma Client`,
    );
    return 0;
  }
  return model.count({ where });
}

async function runCheck(label: string, fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Cannot read properties of undefined|is not a function/i.test(message)) {
      console.warn(`  [aviso] Verificação ignorada (${label}): erro ao acessar modelo Prisma`);
      return 0;
    }
    throw error;
  }
}

async function runSample(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Cannot read properties of undefined|is not a function/i.test(message)) {
      console.warn(`  [aviso] Amostra ignorada (${label}): modelo Prisma indisponível`);
      return;
    }
    throw error;
  }
}

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

async function findTestUsers(): Promise<TestUser[]> {
  return prisma.user.findMany({
    where: { email: { endsWith: EMAIL_SUFFIX, mode: 'insensitive' } },
    select: {
      id: true,
      email: true,
      name: true,
      cpf: true,
      createdAt: true,
      employee: { select: { id: true, employeeId: true, department: true } },
    },
    orderBy: { email: 'asc' },
  });
}

/** FK Restrict — impedem DELETE em users. */
const HARD_BLOCKERS: BlockerCheck[] = [
  {
    modelKey: 'materialRequest',
    label: 'MaterialRequest (requestedBy)',
    hint: 'npx tsx scripts/limpar-dados-teste.ts --confirm',
    where: (ids) => ({ requestedBy: { in: ids } }),
    sample: async (ids) => {
      const model = getPrismaDelegate('materialRequest');
      if (!model?.findMany) return;
      const rows = (await model.findMany({
        where: { requestedBy: { in: ids } },
        select: {
          requestNumber: true,
          status: true,
          description: true,
          requester: { select: { email: true } },
        },
        orderBy: { requestNumber: 'asc' },
        take: 8,
      })) as Array<{
        requestNumber: string;
        status: string;
        description: string | null;
        requester: { email: string };
      }>;
      for (const rm of rows) {
        console.log(
          `  [RM] ${rm.requestNumber} [${rm.status}] por ${rm.requester.email} — ${(rm.description || '').slice(0, 50)}`,
        );
      }
    },
  },
  {
    modelKey: 'quoteMap',
    label: 'QuoteMap (createdBy)',
    hint: 'npx tsx scripts/limpar-dados-teste.ts --confirm',
    where: (ids) => ({ createdBy: { in: ids } }),
    sample: async (ids) => {
      const model = getPrismaDelegate('quoteMap');
      if (!model?.findMany) return;
      const rows = (await model.findMany({
        where: { createdBy: { in: ids } },
        select: { id: true, createdAt: true, creator: { select: { email: true } } },
        take: 5,
      })) as Array<{ id: string; createdAt: Date; creator: { email: string } }>;
      for (const qm of rows) {
        console.log(`  [QM] ${qm.id} por ${qm.creator.email} em ${qm.createdAt.toISOString()}`);
      }
    },
  },
  {
    modelKey: 'purchaseOrder',
    label: 'PurchaseOrder (createdBy)',
    hint: 'npx tsx scripts/limpar-dados-teste.ts --confirm',
    where: (ids) => ({ createdBy: { in: ids } }),
    sample: async (ids) => {
      const model = getPrismaDelegate('purchaseOrder');
      if (!model?.findMany) return;
      const rows = (await model.findMany({
        where: { createdBy: { in: ids } },
        select: {
          orderNumber: true,
          status: true,
          notes: true,
          creator: { select: { email: true } },
        },
        orderBy: { orderNumber: 'asc' },
        take: 8,
      })) as Array<{
        orderNumber: string | null;
        status: string;
        notes: string | null;
        creator: { email: string };
      }>;
      for (const po of rows) {
        console.log(
          `  [OC] ${po.orderNumber ?? '(sem número)'} [${po.status}] por ${po.creator.email}`,
        );
      }
    },
  },
  {
    modelKey: 'demandSheetApproval',
    label: 'DemandSheetApproval (solicitanteId)',
    where: (ids) => ({ solicitanteId: { in: ids } }),
  },
  {
    modelKey: 'demandSheetApproval',
    label: 'DemandSheetApproval (createdBy)',
    where: (ids) => ({ createdBy: { in: ids } }),
  },
  {
    modelKey: 'materialDelivery',
    label: 'MaterialDelivery (createdBy)',
    where: (ids) => ({ createdBy: { in: ids } }),
  },
  {
    modelKey: 'fuelRefuelRequest',
    label: 'FuelRefuelRequest (requesterId)',
    where: (ids) => ({ requesterId: { in: ids } }),
  },
  {
    modelKey: 'logisticsDeliveryRequest',
    label: 'LogisticsDeliveryRequest (createdBy)',
    where: (ids) => ({ createdBy: { in: ids } }),
  },
  {
    modelKey: 'logisticsDeliveryCompletion',
    label: 'LogisticsDeliveryCompletion (completedBy)',
    where: (ids) => ({ completedBy: { in: ids } }),
  },
  {
    modelKey: 'licitacao',
    label: 'Licitacao (createdBy)',
    where: (ids) => ({ createdBy: { in: ids } }),
  },
  {
    modelKey: 'medicalCertificate',
    label: 'MedicalCertificate (approvedBy — FK default Restrict)',
    where: (ids) => ({ approvedBy: { in: ids } }),
  },
  {
    modelKey: 'pointCorrectionRequest',
    label: 'PointCorrectionRequest (approvedBy — FK default Restrict)',
    where: (ids) => ({ approvedBy: { in: ids } }),
  },
];

/** Vínculos sem FK ou que não bloqueiam DELETE — apenas informativo. */
const SOFT_LINKS: SoftLinkCheck[] = [
  {
    modelKey: 'financialControlEntry',
    label: 'FinancialControlEntry (createdBy/updatedBy)',
    count: async (ids) => {
      if (!isPrismaModelAvailable('financialControlEntry')) return 0;
      return countWhere('financialControlEntry', 'FinancialControlEntry (createdBy/updatedBy)', {
        OR: [{ createdBy: { in: ids } }, { updatedBy: { in: ids } }],
      });
    },
  },
  {
    label: 'FinancialControlEntry (ocNumber de OCs criadas por usuários teste)',
    count: async (ids) => {
      if (!isPrismaModelAvailable('purchaseOrder') || !isPrismaModelAvailable('financialControlEntry')) {
        return 0;
      }
      const poModel = getPrismaDelegate('purchaseOrder');
      if (!poModel?.findMany) return 0;
      const pos = (await poModel.findMany({
        where: { createdBy: { in: ids } },
        select: { orderNumber: true },
      })) as Array<{ orderNumber: string | null }>;
      const ocNumbers = pos.map((p) => p.orderNumber?.trim()).filter((n): n is string => !!n);
      if (ocNumbers.length === 0) return 0;
      return countWhere(
        'financialControlEntry',
        'FinancialControlEntry (ocNumber de OCs criadas por usuários teste)',
        {
          OR: ocNumbers.map((ocNumber) => ({
            ocNumber: { equals: ocNumber, mode: 'insensitive' as const },
          })),
        },
      );
    },
  },
  {
    modelKey: 'materialRequest',
    label: 'MaterialRequest (approvedBy/rejectedBy — SetNull ao deletar)',
    count: (ids) =>
      countWhere('materialRequest', 'MaterialRequest (approvedBy/rejectedBy)', {
        OR: [{ approvedBy: { in: ids } }, { rejectedBy: { in: ids } }],
      }),
  },
  {
    modelKey: 'purchaseOrder',
    label: 'PurchaseOrder (approvedBy/compras/gestor — SetNull ao deletar)',
    count: (ids) =>
      countWhere('purchaseOrder', 'PurchaseOrder (approvedBy/compras/gestor)', {
        OR: [
          { approvedBy: { in: ids } },
          { comprasApprovedBy: { in: ids } },
          { gestorApprovedBy: { in: ids } },
        ],
      }),
  },
  {
    modelKey: 'userPermission',
    label: 'UserPermission (permissões do usuário — cascade ao deletar)',
    count: (ids) =>
      countWhere('userPermission', 'UserPermission (permissões do usuário)', {
        userId: { in: ids },
      }),
  },
  {
    modelKey: 'timeRecord',
    label: 'TimeRecord (cascade ao deletar User)',
    count: (ids) => countWhere('timeRecord', 'TimeRecord', { userId: { in: ids } }),
  },
];

async function collectHardBlockers(userIds: string[]): Promise<string[]> {
  const messages: string[] = [];

  for (const check of HARD_BLOCKERS) {
    const total = await runCheck(check.label, () =>
      countWhere(check.modelKey, check.label, check.where(userIds)),
    );
    if (total <= 0) continue;

    let line = `${total} ${check.label}`;
    if (check.hint) line += `. Rode: ${check.hint}`;
    messages.push(line);

    if (check.sample) {
      await runSample(check.label, () => check.sample!(userIds));
    }
  }

  return messages;
}

async function collectSoftLinks(userIds: string[]): Promise<{ label: string; total: number }[]> {
  const results: { label: string; total: number }[] = [];
  for (const check of SOFT_LINKS) {
    const total = await runCheck(check.label, () => check.count(userIds));
    if (total > 0) {
      results.push({ label: check.label, total });
    }
  }
  return results;
}

async function main(): Promise<void> {
  console.log(confirm ? '=== MODO --confirm (vai deletar) ===' : '=== DRY-RUN (nada será deletado) ===');
  printDatabaseTarget();
  console.log(`\nFiltro: email termina com "${EMAIL_SUFFIX}"\n`);

  const users = await findTestUsers();
  const userIds = users.map((u) => u.id);
  const employees = users.filter((u) => u.employee).map((u) => u.employee!);

  console.log('=== CONTAGEM (seria removido) ===');
  console.log(`  Usuários (@loadtest.com): ${users.length}`);
  console.log(`  Employees vinculados:      ${employees.length}`);

  if (users.length === 0) {
    console.log('\nNenhum usuário de teste encontrado. Script idempotente — nada a fazer.');
    return;
  }

  console.log('\nPrévia usuários (até 30):');
  for (const u of users) {
    const emp = u.employee;
    console.log(
      `  ${u.email} | ${u.name} | cpf=${u.cpf}` +
        (emp ? ` | matrícula=${emp.employeeId} dept="${emp.department}"` : ' | (sem Employee)'),
    );
  }

  console.log('\n=== VÍNCULOS INFORMATIVOS (não bloqueiam ou cascade) ===');
  const softLinks = await collectSoftLinks(userIds);
  if (softLinks.length === 0) {
    console.log('  Nenhum vínculo informativo relevante encontrado.');
  } else {
    for (const link of softLinks) {
      console.log(`  ${link.total} — ${link.label}`);
    }
    const hasFc = softLinks.some((l) => l.label.includes('FinancialControl'));
    if (hasFc) {
      console.log(
        '  (FinancialControl não tem FK em User — limpe com limpar-dados-teste.ts se for lixo de carga)',
      );
    }
  }

  console.log('\n=== VERIFICAÇÃO DE BLOQUEIOS (FK Restrict) ===');
  const blockers = await collectHardBlockers(userIds);
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
  console.log('  Nenhum bloqueio FK encontrado — exclusão de User é viável.');

  if (!confirm) {
    console.log('\nOrdem de exclusão (--confirm):');
    console.log('  1. DELETE users WHERE email LIKE %@loadtest.com');
    console.log('  2. Employee, UserPermission, TimeRecord etc. em cascade (schema Prisma)');
    console.log('\nDry-run concluído. Para deletar de fato:');
    console.log('  npx tsx scripts/remover-usuarios-teste.ts --confirm');
    return;
  }

  const deleteResult = await prisma.user.deleteMany({
    where: { email: { endsWith: EMAIL_SUFFIX, mode: 'insensitive' } },
  });

  const remainingUsers = await prisma.user.count({
    where: { email: { endsWith: EMAIL_SUFFIX, mode: 'insensitive' } },
  });

  const remainingEmployees = employees.length
    ? await prisma.employee.count({
        where: { id: { in: employees.map((e) => e.id) } },
      })
    : 0;

  console.log('\n=== REMOVIDO ===');
  console.log(`  Usuários:   ${deleteResult.count}`);
  console.log(`  Employees:  ${employees.length} (cascade esperado junto com User)`);

  if (remainingUsers > 0 || remainingEmployees > 0) {
    console.warn(
      `\n⚠ Ainda restam users=${remainingUsers} employees=${remainingEmployees}. Revise manualmente.`,
    );
    process.exitCode = 1;
  } else {
    console.log('\n✓ Remoção concluída — nenhum usuário @loadtest.com restante no banco.');
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Erro em remover-usuarios-teste:', message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
