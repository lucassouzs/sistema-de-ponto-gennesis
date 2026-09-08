/**
 * Concede a permissão legada de aprovar RMs ao usuário de carga teste1.
 *
 * Execute: npx tsx scripts/conceder-aprovador-rm-teste.ts
 */

import 'dotenv/config';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from '../src/lib/prisma';

const APPROVER_EMAIL = 'teste1@loadtest.com';
const RM_APPROVE_MODULE = pathToModuleKey('/ponto/controle/aprovar-requisicoes-materiais');

async function main(): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { email: APPROVER_EMAIL },
    select: { id: true, email: true, name: true, isActive: true },
  });

  if (!user) {
    throw new Error(
      `Usuário ${APPROVER_EMAIL} não encontrado. Rode antes: npx tsx scripts/criar-usuarios-teste.ts`,
    );
  }

  if (!user.isActive) {
    throw new Error(`Usuário ${APPROVER_EMAIL} está inativo.`);
  }

  const permission = await prisma.userPermission.upsert({
    where: {
      userId_module_action: {
        userId: user.id,
        module: RM_APPROVE_MODULE,
        action: PERMISSION_ACCESS_ACTION,
      },
    },
    create: {
      userId: user.id,
      module: RM_APPROVE_MODULE,
      action: PERMISSION_ACCESS_ACTION,
      allowed: true,
    },
    update: {
      allowed: true,
    },
  });

  console.log('OK — permissão de aprovar RM concedida.');
  console.log(`  usuário:  ${user.email} (${user.name})`);
  console.log(`  userId:   ${user.id}`);
  console.log(`  módulo:   ${RM_APPROVE_MODULE}`);
  console.log(`  action:   ${PERMISSION_ACCESS_ACTION}`);
  console.log(`  allowed:  ${permission.allowed}`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Erro ao conceder permissão de aprovador RM:', message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
