/**
 * Cria 30 usuários de teste para carga local (login + bater ponto).
 *
 * Execute: npx tsx scripts/criar-usuarios-teste.ts
 */

import 'dotenv/config';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from '../src/lib/prisma';
import { BCRYPT_ROUNDS, hashPassword } from '../src/lib/passwordHash';

const TOTAL_USERS = 30;
const PASSWORD = 'Teste123!';

const OUTPUT_FILE = join(__dirname, 'test-users.json');

const DEFAULT_WORK_SCHEDULE = {
  startTime: '08:00',
  endTime: '17:00',
  lunchStartTime: '12:00',
  lunchEndTime: '13:00',
  workDays: [1, 2, 3, 4, 5],
  toleranceMinutes: 10,
};

/** Módulos mínimos para logar e usar o fluxo de ponto no frontend. */
const BASIC_MODULE_PATHS = [
  '/ponto',
  '/ponto/painel-do-sistema',
  '/ponto/banco-horas',
  '/ponto/solicitacoes',
] as const;

type TestUserCredential = { email: string; password: string };

function buildEmail(index: number): string {
  return `teste${index}@loadtest.com`;
}

function buildName(index: number): string {
  return `Usuário Teste ${index}`;
}

function buildCpf(index: number): string {
  const body = String(index).padStart(3, '0');
  const check = String(index % 100).padStart(2, '0');
  return `900.000.${body}-${check}`;
}

function buildEmployeeId(index: number): string {
  return `LOAD${String(index).padStart(3, '0')}`;
}

async function upsertBasicPermissions(userId: string): Promise<void> {
  for (const href of BASIC_MODULE_PATHS) {
    const module = pathToModuleKey(href);
    await prisma.userPermission.upsert({
      where: {
        userId_module_action: {
          userId,
          module,
          action: PERMISSION_ACCESS_ACTION,
        },
      },
      create: {
        userId,
        module,
        action: PERMISSION_ACCESS_ACTION,
        allowed: true,
      },
      update: {
        allowed: true,
      },
    });
  }
}

async function upsertTestUser(index: number, hashedPassword: string): Promise<void> {
  const email = buildEmail(index);
  const name = buildName(index);
  const cpf = buildCpf(index);
  const employeeId = buildEmployeeId(index);
  const hireDate = new Date();

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      password: hashedPassword,
      name,
      cpf,
      role: 'EMPLOYEE',
      isActive: true,
      isFirstLogin: false,
    },
    update: {
      password: hashedPassword,
      name,
      isActive: true,
      isFirstLogin: false,
    },
  });

  await prisma.employee.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      employeeId,
      department: 'Testes de Carga',
      position: 'Operador',
      hireDate,
      salary: 0,
      workSchedule: DEFAULT_WORK_SCHEDULE,
      isRemote: false,
      requiresTimeClock: true,
    },
    update: {
      employeeId,
      department: 'Testes de Carga',
      position: 'Operador',
      workSchedule: DEFAULT_WORK_SCHEDULE,
      isRemote: false,
      requiresTimeClock: true,
    },
  });

  await upsertBasicPermissions(user.id);
}

async function main(): Promise<void> {
  console.log(`Criando ou atualizando ${TOTAL_USERS} usuários de teste...\n`);

  const hashedPassword = await hashPassword(PASSWORD, BCRYPT_ROUNDS);
  const credentials: TestUserCredential[] = [];

  for (let index = 1; index <= TOTAL_USERS; index += 1) {
    await upsertTestUser(index, hashedPassword);
    const email = buildEmail(index);
    credentials.push({ email, password: PASSWORD });
    console.log(`  OK  ${email}`);
  }

  writeFileSync(OUTPUT_FILE, `${JSON.stringify(credentials, null, 2)}\n`, 'utf8');

  console.log(`\nConcluído. Credenciais salvas em:\n  ${OUTPUT_FILE}`);
  console.log(`Senha padrão: ${PASSWORD}`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Erro ao criar usuários de teste:', message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
