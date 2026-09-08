/**
 * Concede permissões de aprovação de OC aos usuários de carga teste1–teste3.
 *
 * Execute: npx tsx scripts/conceder-aprovador-oc-teste.ts
 */

import 'dotenv/config';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from '../src/lib/prisma';

const OC_APPROVAL_GRANTS = [
  {
    email: 'teste1@loadtest.com',
    href: '/ponto/controle/aprovar-oc-compras',
    role: 'Compras',
  },
  {
    email: 'teste2@loadtest.com',
    href: '/ponto/controle/aprovar-oc-gestor',
    role: 'Gestor',
  },
  {
    email: 'teste3@loadtest.com',
    href: '/ponto/controle/aprovar-oc-diretoria',
    role: 'Diretoria',
  },
] as const;

async function main(): Promise<void> {
  console.log('Concedendo permissões de aprovação de OC...\n');

  for (const grant of OC_APPROVAL_GRANTS) {
    const module = pathToModuleKey(grant.href);

    const user = await prisma.user.findUnique({
      where: { email: grant.email },
      select: { id: true, email: true, name: true, isActive: true },
    });

    if (!user) {
      throw new Error(
        `Usuário ${grant.email} não encontrado. Rode antes: npx tsx scripts/criar-usuarios-teste.ts`,
      );
    }

    if (!user.isActive) {
      throw new Error(`Usuário ${grant.email} está inativo.`);
    }

    const permission = await prisma.userPermission.upsert({
      where: {
        userId_module_action: {
          userId: user.id,
          module,
          action: PERMISSION_ACCESS_ACTION,
        },
      },
      create: {
        userId: user.id,
        module,
        action: PERMISSION_ACCESS_ACTION,
        allowed: true,
      },
      update: {
        allowed: true,
      },
    });

    console.log(`OK — ${grant.role}`);
    console.log(`  usuário:  ${user.email} (${user.name})`);
    console.log(`  userId:   ${user.id}`);
    console.log(`  módulo:   ${module}`);
    console.log(`  href:     ${grant.href}`);
    console.log(`  action:   ${PERMISSION_ACCESS_ACTION}`);
    console.log(`  allowed:  ${permission.allowed}`);
    console.log('');
  }

  console.log('Todas as permissões de aprovação de OC foram concedidas.');
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Erro ao conceder permissões de aprovador OC:', message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
