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
      name: 'Gennesis Engenharia',
      cnpj: '38.294.339/0001-10',
      address: '24, St. de Habitações Individuais Sul QI 11 - Lago Sul, Brasília - DF, 70297-400',
      phone: '(61) 99517-6932',
      email: 'contato@engenharia.com.br',
      workStartTime: '07:00',
      workEndTime: '17:00',
      lunchStartTime: '12:00',
      lunchEndTime: '13:00',
      toleranceMinutes: 10,
      maxOvertimeHours: 2,
      maxDistanceMeters: 1000,
      defaultLatitude: -15.835840,
      defaultLongitude: -47.873407,
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
    where: { email: 'teste@engenharia.com.br' },
    update: {},
    create: {
      email: 'teste@engenharia.com.br',
      password: employeePassword,
      name: 'Teste',
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
      hireDate: new Date('2025-09-01 07:00:00'),
      birthDate: new Date('1995-09-24'), // Aniversário em 24/09
      salary: 10000.00,
      workSchedule: {
        startTime: '07:00',
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
          latitude: -15.835840,
          longitude: -47.873407,
          radius: 100
        }
      ]
    }
  });

  console.log('✅ Funcionário de exemplo criado: teste@engenharia.com.br / func123');

  // Criar mais funcionários de teste com aniversários
  const employees = [
    {
      email: 'joao@engenharia.com.br',
      name: 'João Silva',
      cpf: '12345678901',
      employeeId: 'EMP002',
      department: 'Engenharia Elétrica',
      position: 'Engenheiro Elétrico',
      birthDate: new Date('1990-09-15'), // 15/09
      hireDate: new Date('2024-01-15'),
      // Novos campos de exemplo
      company: 'GÊNNESIS',
      currentContract: 'PROJETO ELÉTRICO A',
      bank: 'BANCO DO BRASIL',
      accountType: 'CONTA CORRENTE',
      agency: '1234',
      operation: '01',
      account: '12345',
      digit: '6',
      pixKeyType: 'CPF',
      pixKey: '12345678901'
    },
    {
      email: 'maria@engenharia.com.br',
      name: 'Maria Santos',
      cpf: '12345678902',
      employeeId: 'EMP003',
      department: 'Recursos Humanos',
      position: 'Analista de RH',
      birthDate: new Date('1988-09-30'), // 30/09
      hireDate: new Date('2023-06-01'),
      // Novos campos de exemplo
      company: 'GÊNNESIS',
      currentContract: 'ADMINISTRATIVO',
      bank: 'ITAÚ',
      accountType: 'CONTA SALÁRIO',
      agency: '5678',
      operation: '05',
      account: '67890',
      digit: '7',
      pixKeyType: 'CELULAR',
      pixKey: '(61) 99999-9999'
    },
    {
      email: 'pedro@engenharia.com.br',
      name: 'Pedro Oliveira',
      cpf: '12345678903',
      employeeId: 'EMP004',
      department: 'Engenharia Civil',
      position: 'Arquiteto',
      birthDate: new Date('1992-10-05'), // 05/10 (outro mês)
      hireDate: new Date('2024-03-10'),
      // Novos campos de exemplo
      company: 'MÉTRICA',
      currentContract: 'PROJETO CIVIL B',
      bank: 'BRADESCO',
      accountType: 'POUPANÇA',
      agency: '9012',
      operation: '13',
      account: '11111',
      digit: '8',
      pixKeyType: 'E-MAIL',
      pixKey: 'pedro@engenharia.com.br'
    }
  ];

  for (const empData of employees) {
    const empPassword = await bcrypt.hash('func123', 12);
    const emp = await prisma.user.upsert({
      where: { email: empData.email },
      update: {},
      create: {
        email: empData.email,
        password: empPassword,
        name: empData.name,
        cpf: empData.cpf,
        role: UserRole.EMPLOYEE,
        isActive: true
      }
    });

    await prisma.employee.upsert({
      where: { userId: emp.id },
      update: {},
      create: {
        userId: emp.id,
        employeeId: empData.employeeId,
        department: empData.department,
        position: empData.position,
        hireDate: empData.hireDate,
        birthDate: empData.birthDate,
        salary: 8000.00,
        workSchedule: {
          startTime: '07:00',
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
            latitude: -15.835840,
            longitude: -47.873407,
            radius: 100
          }
        ],
        // Novos campos
        company: empData.company,
        currentContract: empData.currentContract,
        bank: empData.bank,
        accountType: empData.accountType,
        agency: empData.agency,
        operation: empData.operation,
        account: empData.account,
        digit: empData.digit,
        pixKeyType: empData.pixKeyType,
        pixKey: empData.pixKey
      }
    });

    console.log(`✅ Funcionário criado: ${empData.email} / func123`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
