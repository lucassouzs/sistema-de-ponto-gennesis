import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Criar configurações da empresa
  await prisma.companySettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      name: 'Empresa de Engenharia Ltda',
      cnpj: '12.345.678/0001-90',
      address: 'Rua das Engenharias, 123 - Centro - São Paulo/SP',
      phone: '(11) 99999-9999',
      email: 'contato@engenharia.com.br',
      workStartTime: '08:00',
      workEndTime: '17:00',
      lunchStartTime: '12:00',
      lunchEndTime: '13:00',
      toleranceMinutes: 10,
      maxOvertimeHours: 2,
      maxDistanceMeters: 1000,
      defaultLatitude: -23.5505,
      defaultLongitude: -46.6333,
      vacationDaysPerYear: 30
    }
  });

  console.log('✅ Configurações da empresa criadas');

  // Criar usuário administrador
  const adminPassword = await bcrypt.hash('admin123', 12);
  await prisma.user.upsert({
    where: { email: 'admin@engenharia.com.br' },
    update: {},
    create: {
      email: 'admin@engenharia.com.br',
      password: adminPassword,
      name: 'Administrador do Sistema',
      cpf: '00000000000',
      role: UserRole.ADMIN,
      isActive: true
    }
  });

  console.log('✅ Usuário administrador criado: admin@engenharia.com.br / admin123');

  // Criar usuário RH
  const hrPassword = await bcrypt.hash('rh123', 12);
  await prisma.user.upsert({
    where: { email: 'rh@engenharia.com.br' },
    update: {},
    create: {
      email: 'rh@engenharia.com.br',
      password: hrPassword,
      name: 'Recursos Humanos',
      cpf: '11111111111',
      role: UserRole.HR,
      isActive: true
    }
  });

  console.log('✅ Usuário RH criado: rh@engenharia.com.br / rh123');

  // Criar funcionário de exemplo
  const employeePassword = await bcrypt.hash('func123', 12);
  const employee = await prisma.user.upsert({
    where: { email: 'joao.silva@engenharia.com.br' },
    update: {},
    create: {
      email: 'joao.silva@engenharia.com.br',
      password: employeePassword,
      name: 'João Silva',
      cpf: '12345678900',
      role: UserRole.EMPLOYEE,
      isActive: true
    }
  });

  // Criar dados do funcionário
  await prisma.employee.upsert({
    where: { userId: employee.id },
    update: {},
    create: {
      userId: employee.id,
      employeeId: 'EMP001',
      department: 'Engenharia Civil',
      position: 'Engenheiro Civil',
      hireDate: new Date('2023-01-15'),
      salary: 8000.00,
      workSchedule: {
        startTime: '08:00',
        endTime: '17:00',
        lunchStartTime: '12:00',
        lunchEndTime: '13:00',
        workDays: [1, 2, 3, 4, 5],
        toleranceMinutes: 10
      },
      isRemote: false,
      allowedLocations: [
        {
          id: 'loc_1',
          name: 'Escritório Principal',
          latitude: -23.5505,
          longitude: -46.6333,
          radius: 100
        }
      ]
    }
  });

  console.log('✅ Funcionário de exemplo criado: joao.silva@engenharia.com.br / func123');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
