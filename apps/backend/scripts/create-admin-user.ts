/**
 * Script para criar um usuário administrador.
 * O administrador é identificado pelo CARGO (Employee.position = 'Administrador'),
 * não pela role do usuário (que continua EMPLOYEE).
 *
 * Execute: npx ts-node scripts/create-admin-user.ts
 * Ou: npm run create:admin
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Dados do administrador - altere conforme necessário
const ADMIN_DATA = {
  name: 'Administrador',
  email: 'admin@gennesis.com.br',
  cpf: '000.000.000-00',
  password: 'admin123',
  employeeId: 'ADM001',
  department: 'Administrativo',
  position: 'Administrador',
};

async function main() {
  console.log('🔐 Criando usuário administrador...\n');

  try {
    // Verificar se email já existe
    const existingUser = await prisma.user.findUnique({
      where: { email: ADMIN_DATA.email },
    });

    if (existingUser) {
      console.log('⚠️  Este email já está cadastrado:', ADMIN_DATA.email);
      console.log('   Para criar outro admin, altere o email no script.');
      return;
    }

    // Verificar se CPF já existe
    const existingCpf = await prisma.user.findUnique({
      where: { cpf: ADMIN_DATA.cpf },
    });

    if (existingCpf) {
      console.log('⚠️  Este CPF já está cadastrado:', ADMIN_DATA.cpf);
      console.log('   Para criar outro admin, altere o CPF no script.');
      return;
    }

    // Verificar se matrícula já existe
    const existingEmployeeId = await prisma.employee.findUnique({
      where: { employeeId: ADMIN_DATA.employeeId },
    });

    if (existingEmployeeId) {
      console.log('⚠️  Esta matrícula já está cadastrada:', ADMIN_DATA.employeeId);
      console.log('   Para criar outro admin, altere a matrícula no script.');
      return;
    }

    const hashedPassword = await bcrypt.hash(ADMIN_DATA.password, 12);
    const hireDate = new Date();

    const { user, employee } = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: ADMIN_DATA.name,
          email: ADMIN_DATA.email,
          cpf: ADMIN_DATA.cpf,
          password: hashedPassword,
          role: 'EMPLOYEE', // Não usamos mais role - o admin é pelo cargo
        },
      });

      const newEmployee = await tx.employee.create({
        data: {
          userId: newUser.id,
          employeeId: ADMIN_DATA.employeeId,
          department: ADMIN_DATA.department,
          position: ADMIN_DATA.position,
          hireDate,
          salary: 0,
          workSchedule: {
            startTime: '08:00',
            endTime: '17:00',
            lunchStartTime: '12:00',
            lunchEndTime: '13:00',
            workDays: [1, 2, 3, 4, 5],
          },
          isRemote: false,
          requiresTimeClock: false,
        },
      });

      return { user: newUser, employee: newEmployee };
    });

    console.log('✅ Usuário administrador criado com sucesso!\n');
    console.log('📋 Dados de acesso:');
    console.log('   Email:    ', ADMIN_DATA.email);
    console.log('   Senha:    ', ADMIN_DATA.password);
    console.log('   Cargo:    ', employee.position);
    console.log('   Matrícula:', employee.employeeId);
    console.log('\n⚠️  Lembre-se de alterar a senha no primeiro acesso!\n');
  } catch (error: any) {
    console.error('❌ Erro ao criar administrador:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
