const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

// Função para gerar CPF válido
function generateCPF() {
  function randomDigits(length) {
    return Array.from({ length }, () => Math.floor(Math.random() * 10));
  }

  function calculateDigit(digits, weights) {
    const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  }

  const base = randomDigits(9);
  const firstDigit = calculateDigit(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const secondDigit = calculateDigit([...base, firstDigit], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  
  return [...base, firstDigit, secondDigit].join('');
}

// Função para formatar CPF
function formatCPF(cpf) {
  return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

// Função para gerar matrícula
function generateEmployeeId(company, index) {
  const prefix = company === 'GÊNNESIS' ? 'GEN' : 'ABR';
  return `${prefix}${String(index).padStart(3, '0')}`;
}

// Função para gerar data de nascimento
function generateBirthDate() {
  const year = 1965 + Math.floor(Math.random() * 35); // 1965-2000
  const month = Math.floor(Math.random() * 12) + 1;
  const day = Math.floor(Math.random() * 28) + 1;
  return new Date(year, month - 1, day);
}

// Função para gerar data de admissão
function generateHireDate() {
  const year = 2022 + Math.floor(Math.random() * 2); // 2022-2023
  const month = Math.floor(Math.random() * 12) + 1;
  const day = Math.floor(Math.random() * 28) + 1;
  return new Date(year, month - 1, day);
}

// Dados dos usuários conforme o plano
const usersData = [
  // GENNESIS - ITAMARATY SERVIÇOS EVENTUAIS (3 pessoas)
  {
    name: 'João Silva Santos',
    email: 'joao.silva@gennesis.com',
    role: 'EMPLOYEE',
    company: 'GÊNNESIS',
    costCenter: 'ITAMARATY - SERVIÇOS EVENTUAIS',
    position: 'Gerente de Projetos',
    department: 'Administrativo',
    salary: 8500.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Banco do Brasil',
    accountType: 'Conta Corrente',
    agency: '1234',
    operation: '01',
    account: '12345',
    digit: '6',
    pixKeyType: 'Email',
    pixKey: 'joao.silva@gennesis.com'
  },
  {
    name: 'Maria Oliveira Costa',
    email: 'maria.oliveira@gennesis.com',
    role: 'EMPLOYEE',
    company: 'GÊNNESIS',
    costCenter: 'ITAMARATY - SERVIÇOS EVENTUAIS',
    position: 'Analista de RH',
    department: 'Recursos Humanos',
    salary: 6200.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Caixa Econômica',
    accountType: 'Conta Corrente',
    agency: '2345',
    operation: '01',
    account: '23456',
    digit: '7',
    pixKeyType: 'Email',
    pixKey: 'maria.oliveira@gennesis.com'
  },
  {
    name: 'Pedro Almeida Lima',
    email: 'pedro.almeida@gennesis.com',
    role: 'EMPLOYEE',
    company: 'GÊNNESIS',
    costCenter: 'ITAMARATY - SERVIÇOS EVENTUAIS',
    position: 'Desenvolvedor',
    department: 'Tecnologia',
    salary: 5800.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Itaú',
    accountType: 'Conta Corrente',
    agency: '3456',
    operation: '01',
    account: '34567',
    digit: '8',
    pixKeyType: 'CPF',
    pixKey: '34567890123'
  },

  // GENNESIS - SEDES (5 pessoas)
  {
    name: 'Ana Carolina Ferreira',
    email: 'ana.carolina@gennesis.com',
    role: 'EMPLOYEE',
    company: 'GÊNNESIS',
    costCenter: 'SEDES',
    position: 'Analista Financeiro',
    department: 'Financeiro',
    salary: 6500.00,
    modality: 'CLT',
    familySalary: 150.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Bradesco',
    accountType: 'Conta Corrente',
    agency: '4567',
    operation: '01',
    account: '45678',
    digit: '9',
    pixKeyType: 'Email',
    pixKey: 'ana.carolina@gennesis.com'
  },
  {
    name: 'Carlos Eduardo Souza',
    email: 'carlos.souza@gennesis.com',
    role: 'EMPLOYEE',
    company: 'GÊNNESIS',
    costCenter: 'SEDES',
    position: 'Assistente Administrativo',
    department: 'Administrativo',
    salary: 4200.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Banco do Brasil',
    accountType: 'Conta Poupança',
    agency: '5678',
    operation: '01',
    account: '56789',
    digit: '0',
    pixKeyType: 'CPF',
    pixKey: '56789012345'
  },
  {
    name: 'Fernanda Rodrigues',
    email: 'fernanda.rodrigues@gennesis.com',
    role: 'EMPLOYEE',
    company: 'GÊNNESIS',
    costCenter: 'SEDES',
    position: 'Coordenadora de Projetos',
    department: 'Projetos',
    salary: 7800.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Caixa Econômica',
    accountType: 'Conta Corrente',
    agency: '6789',
    operation: '01',
    account: '67890',
    digit: '1',
    pixKeyType: 'Email',
    pixKey: 'fernanda.rodrigues@gennesis.com'
  },
  {
    name: 'Roberto Mendes',
    email: 'roberto.mendes@gennesis.com',
    role: 'EMPLOYEE',
    company: 'GÊNNESIS',
    costCenter: 'SEDES',
    position: 'Técnico em Segurança',
    department: 'Segurança',
    salary: 5500.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 30,
    unhealthyPay: 0,
    bank: 'Itaú',
    accountType: 'Conta Corrente',
    agency: '7890',
    operation: '01',
    account: '78901',
    digit: '2',
    pixKeyType: 'CPF',
    pixKey: '78901234567'
  },
  {
    name: 'Juliana Santos',
    email: 'juliana.santos@gennesis.com',
    role: 'EMPLOYEE',
    company: 'GÊNNESIS',
    costCenter: 'SEDES',
    position: 'Recepcionista',
    department: 'Atendimento',
    salary: 3800.00,
    modality: 'CLT',
    familySalary: 150.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Bradesco',
    accountType: 'Conta Corrente',
    agency: '8901',
    operation: '01',
    account: '89012',
    digit: '3',
    pixKeyType: 'Email',
    pixKey: 'juliana.santos@gennesis.com'
  },

  // GENNESIS - SES GDF LOTE 10 (6 pessoas)
  {
    name: 'Marcos Antonio Pereira',
    email: 'marcos.pereira@gennesis.com',
    role: 'EMPLOYEE',
    company: 'GÊNNESIS',
    costCenter: 'SES GDF - LOTE 10',
    position: 'Engenheiro Civil',
    department: 'Engenharia',
    salary: 9200.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Banco do Brasil',
    accountType: 'Conta Corrente',
    agency: '9012',
    operation: '01',
    account: '90123',
    digit: '4',
    pixKeyType: 'Email',
    pixKey: 'marcos.pereira@gennesis.com'
  },
  {
    name: 'Patricia Costa Silva',
    email: 'patricia.costa@gennesis.com',
    role: 'EMPLOYEE',
    company: 'GÊNNESIS',
    costCenter: 'SES GDF - LOTE 10',
    position: 'Arquiteta',
    department: 'Arquitetura',
    salary: 8800.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Caixa Econômica',
    accountType: 'Conta Corrente',
    agency: '0123',
    operation: '01',
    account: '01234',
    digit: '5',
    pixKeyType: 'Email',
    pixKey: 'patricia.costa@gennesis.com'
  },
  {
    name: 'Rafael Oliveira',
    email: 'rafael.oliveira@gennesis.com',
    role: 'EMPLOYEE',
    company: 'GÊNNESIS',
    costCenter: 'SES GDF - LOTE 10',
    position: 'Técnico em Edificações',
    department: 'Construção',
    salary: 6800.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 30,
    unhealthyPay: 20,
    bank: 'Itaú',
    accountType: 'Conta Corrente',
    agency: '1234',
    operation: '01',
    account: '12345',
    digit: '6',
    pixKeyType: 'CPF',
    pixKey: '12345678901'
  },
  {
    name: 'Larissa Fernandes',
    email: 'larissa.fernandes@gennesis.com',
    role: 'EMPLOYEE',
    company: 'GÊNNESIS',
    costCenter: 'SES GDF - LOTE 10',
    position: 'Assistente de Obra',
    department: 'Construção',
    salary: 4800.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Bradesco',
    accountType: 'Conta Poupança',
    agency: '2345',
    operation: '01',
    account: '23456',
    digit: '7',
    pixKeyType: 'Email',
    pixKey: 'larissa.fernandes@gennesis.com'
  },
  {
    name: 'Diego Martins',
    email: 'diego.martins@gennesis.com',
    role: 'EMPLOYEE',
    company: 'GÊNNESIS',
    costCenter: 'SES GDF - LOTE 10',
    position: 'Supervisor de Obra',
    department: 'Construção',
    salary: 7200.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 30,
    unhealthyPay: 0,
    bank: 'Banco do Brasil',
    accountType: 'Conta Corrente',
    agency: '3456',
    operation: '01',
    account: '34567',
    digit: '8',
    pixKeyType: 'CPF',
    pixKey: '34567890123'
  },
  {
    name: 'Camila Ribeiro',
    email: 'camila.ribeiro@gennesis.com',
    role: 'EMPLOYEE',
    company: 'GÊNNESIS',
    costCenter: 'SES GDF - LOTE 10',
    position: 'Técnica em Segurança do Trabalho',
    department: 'Segurança',
    salary: 6200.00,
    modality: 'CLT',
    familySalary: 150.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Caixa Econômica',
    accountType: 'Conta Corrente',
    agency: '4567',
    operation: '01',
    account: '45678',
    digit: '9',
    pixKeyType: 'Email',
    pixKey: 'camila.ribeiro@gennesis.com'
  },

  // ABRASIL - ITAMARATY SERVIÇOS EVENTUAIS (6 pessoas)
  {
    name: 'André Luiz Barbosa',
    email: 'andre.barbosa@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'ITAMARATY - SERVIÇOS EVENTUAIS',
    position: 'Diretor de Operações',
    department: 'Diretoria',
    salary: 12500.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Banco do Brasil',
    accountType: 'Conta Corrente',
    agency: '5678',
    operation: '01',
    account: '56789',
    digit: '0',
    pixKeyType: 'Email',
    pixKey: 'andre.barbosa@abrasil.com'
  },
  {
    name: 'Simone Alves',
    email: 'simone.alves@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'ITAMARATY - SERVIÇOS EVENTUAIS',
    position: 'Gerente de RH',
    department: 'Recursos Humanos',
    salary: 8200.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Caixa Econômica',
    accountType: 'Conta Corrente',
    agency: '6789',
    operation: '01',
    account: '67890',
    digit: '1',
    pixKeyType: 'Email',
    pixKey: 'simone.alves@abrasil.com'
  },
  {
    name: 'Gustavo Henrique',
    email: 'gustavo.henrique@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'ITAMARATY - SERVIÇOS EVENTUAIS',
    position: 'Analista de Sistemas',
    department: 'TI',
    salary: 7500.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Itaú',
    accountType: 'Conta Corrente',
    agency: '7890',
    operation: '01',
    account: '78901',
    digit: '2',
    pixKeyType: 'CPF',
    pixKey: '78901234567'
  },
  {
    name: 'Beatriz Nascimento',
    email: 'beatriz.nascimento@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'ITAMARATY - SERVIÇOS EVENTUAIS',
    position: 'Designer Gráfico',
    department: 'Design',
    salary: 5200.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Bradesco',
    accountType: 'Conta Corrente',
    agency: '8901',
    operation: '01',
    account: '89012',
    digit: '3',
    pixKeyType: 'Email',
    pixKey: 'beatriz.nascimento@abrasil.com'
  },
  {
    name: 'Thiago Rocha',
    email: 'thiago.rocha@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'ITAMARATY - SERVIÇOS EVENTUAIS',
    position: 'Assistente de Projetos',
    department: 'Projetos',
    salary: 4800.00,
    modality: 'MEI',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Banco do Brasil',
    accountType: 'Conta Corrente',
    agency: '9012',
    operation: '01',
    account: '90123',
    digit: '4',
    pixKeyType: 'CPF',
    pixKey: '90123456789'
  },
  {
    name: 'Renata Lopes',
    email: 'renata.lopes@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'ITAMARATY - SERVIÇOS EVENTUAIS',
    position: 'Contadora',
    department: 'Contabilidade',
    salary: 6800.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Caixa Econômica',
    accountType: 'Conta Corrente',
    agency: '0123',
    operation: '01',
    account: '01234',
    digit: '5',
    pixKeyType: 'Email',
    pixKey: 'renata.lopes@abrasil.com'
  },

  // ABRASIL - SEDES (5 pessoas)
  {
    name: 'Vinicius Correia',
    email: 'vinicius.correia@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'SEDES',
    position: 'Analista de Compras',
    department: 'Compras',
    salary: 5800.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Itaú',
    accountType: 'Conta Corrente',
    agency: '1234',
    operation: '01',
    account: '12345',
    digit: '6',
    pixKeyType: 'CPF',
    pixKey: '12345678901'
  },
  {
    name: 'Amanda Silva',
    email: 'amanda.silva@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'SEDES',
    position: 'Assistente Administrativo',
    department: 'Administrativo',
    salary: 4200.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Bradesco',
    accountType: 'Conta Poupança',
    agency: '2345',
    operation: '01',
    account: '23456',
    digit: '7',
    pixKeyType: 'Email',
    pixKey: 'amanda.silva@abrasil.com'
  },
  {
    name: 'Leandro Santos',
    email: 'leandro.santos@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'SEDES',
    position: 'Coordenador de Logística',
    department: 'Logística',
    salary: 7800.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Banco do Brasil',
    accountType: 'Conta Corrente',
    agency: '3456',
    operation: '01',
    account: '34567',
    digit: '8',
    pixKeyType: 'CPF',
    pixKey: '34567890123'
  },
  {
    name: 'Priscila Oliveira',
    email: 'priscila.oliveira@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'SEDES',
    position: 'Técnica em Qualidade',
    department: 'Qualidade',
    salary: 6500.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Caixa Econômica',
    accountType: 'Conta Corrente',
    agency: '4567',
    operation: '01',
    account: '45678',
    digit: '9',
    pixKeyType: 'Email',
    pixKey: 'priscila.oliveira@abrasil.com'
  },
  {
    name: 'Fabio Mendes',
    email: 'fabio.mendes@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'SEDES',
    position: 'Operador de Máquinas',
    department: 'Produção',
    salary: 5200.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 30,
    unhealthyPay: 0,
    bank: 'Itaú',
    accountType: 'Conta Corrente',
    agency: '5678',
    operation: '01',
    account: '56789',
    digit: '0',
    pixKeyType: 'CPF',
    pixKey: '56789012345'
  },

  // ABRASIL - SES GDF LOTE 10 (4 pessoas)
  {
    name: 'Carolina Dias',
    email: 'carolina.dias@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'SES GDF - LOTE 10',
    position: 'Engenheira Ambiental',
    department: 'Meio Ambiente',
    salary: 8500.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 20,
    bank: 'Bradesco',
    accountType: 'Conta Corrente',
    agency: '6789',
    operation: '01',
    account: '67890',
    digit: '1',
    pixKeyType: 'Email',
    pixKey: 'carolina.dias@abrasil.com'
  },
  {
    name: 'Marcelo Costa',
    email: 'marcelo.costa@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'SES GDF - LOTE 10',
    position: 'Técnico em Segurança',
    department: 'Segurança',
    salary: 6200.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 30,
    unhealthyPay: 0,
    bank: 'Banco do Brasil',
    accountType: 'Conta Corrente',
    agency: '7890',
    operation: '01',
    account: '78901',
    digit: '2',
    pixKeyType: 'CPF',
    pixKey: '78901234567'
  },
  {
    name: 'Luciana Ferreira',
    email: 'luciana.ferreira@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'SES GDF - LOTE 10',
    position: 'Assistente de Obra',
    department: 'Construção',
    salary: 4800.00,
    modality: 'ESTAGIARIO',
    familySalary: 0.00,
    dangerPay: 0,
    unhealthyPay: 0,
    bank: 'Caixa Econômica',
    accountType: 'Conta Corrente',
    agency: '8901',
    operation: '01',
    account: '89012',
    digit: '3',
    pixKeyType: 'Email',
    pixKey: 'luciana.ferreira@abrasil.com'
  },
  {
    name: 'Bruno Alves',
    email: 'bruno.alves@abrasil.com',
    role: 'EMPLOYEE',
    company: 'ABRASIL',
    costCenter: 'SES GDF - LOTE 10',
    position: 'Supervisor de Obra',
    department: 'Construção',
    salary: 7200.00,
    modality: 'CLT',
    familySalary: 0.00,
    dangerPay: 30,
    unhealthyPay: 0,
    bank: 'Itaú',
    accountType: 'Conta Corrente',
    agency: '9012',
    operation: '01',
    account: '90123',
    digit: '4',
    pixKeyType: 'CPF',
    pixKey: '90123456789'
  }
];

// Função para gerar pontos batidos
async function generateTimeRecords(userId, employeeId, hireDate) {
  const startDate = new Date(hireDate);
  const endDate = new Date();
  
  const records = [];
  
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    // Pular fins de semana
    if (date.getDay() === 0 || date.getDay() === 6) continue;
    
    // 5% de chance de faltar
    if (Math.random() < 0.05) continue;
    
    // Horários base
    const baseEntry = new Date(date);
    baseEntry.setHours(7, Math.floor(Math.random() * 30), 0, 0); // 07:00-07:30
    
    const baseLunchOut = new Date(date);
    baseLunchOut.setHours(12, Math.floor(Math.random() * 30), 0, 0); // 12:00-12:30
    
    const baseLunchIn = new Date(date);
    baseLunchIn.setHours(13, Math.floor(Math.random() * 30), 0, 0); // 13:00-13:30
    
    const baseExit = new Date(date);
    baseExit.setHours(17, Math.floor(Math.random() * 90), 0, 0); // 17:00-18:30
    
    // Coordenadas em Brasília-DF
    const latitude = -15.835840 + (Math.random() - 0.5) * 0.02;
    const longitude = -47.873407 + (Math.random() - 0.5) * 0.02;
    
    records.push(
      {
        userId,
        employeeId,
        type: 'ENTRY',
        timestamp: baseEntry,
        latitude,
        longitude,
        isValid: true,
        foodVoucherAmount: 33.40,
        transportVoucherAmount: 11.00
      },
      {
        userId,
        employeeId,
        type: 'LUNCH_START',
        timestamp: baseLunchOut,
        latitude,
        longitude,
        isValid: true,
        foodVoucherAmount: 33.40,
        transportVoucherAmount: 11.00
      },
      {
        userId,
        employeeId,
        type: 'LUNCH_END',
        timestamp: baseLunchIn,
        latitude,
        longitude,
        isValid: true,
        foodVoucherAmount: 33.40,
        transportVoucherAmount: 11.00
      },
      {
        userId,
        employeeId,
        type: 'EXIT',
        timestamp: baseExit,
        latitude,
        longitude,
        isValid: true,
        foodVoucherAmount: 33.40,
        transportVoucherAmount: 11.00
      }
    );
  }
  
  return records;
}

// Função principal
async function createTestUsers() {
  try {
    console.log('🚀 Iniciando criação de usuários de teste...');
    
    // Limpar dados existentes
    console.log('🧹 Limpando dados existentes...');
    await prisma.timeRecord.deleteMany({});
    await prisma.employee.deleteMany({});
    await prisma.user.deleteMany({});
    console.log('✅ Dados existentes removidos');
    
    let userIndex = 1;
    
    for (const userData of usersData) {
      console.log(`\n📝 Criando usuário ${userIndex}/${usersData.length}: ${userData.name}`);
      
      // Gerar dados únicos
      const cpf = formatCPF(generateCPF());
      const birthDate = generateBirthDate();
      const hireDate = generateHireDate();
      const employeeId = generateEmployeeId(userData.company, userIndex);
      
      // Hash da senha
      const hashedPassword = await bcrypt.hash('123456', 10);
      
      // Criar usuário
      const user = await prisma.user.create({
        data: {
          name: userData.name,
          email: userData.email,
          password: hashedPassword,
          role: userData.role,
          cpf
        }
      });
      
      console.log(`   ✅ Usuário criado: ${user.email}`);
      
      // Criar funcionário
      const employee = await prisma.employee.create({
        data: {
          userId: user.id,
          employeeId,
          department: userData.department,
          position: userData.position,
          salary: userData.salary,
          hireDate,
          birthDate,
          workSchedule: {
            startTime: '07:00',
            endTime: '17:00',
            lunchStartTime: '12:00',
            lunchEndTime: '13:00',
            toleranceMinutes: 10
          },
          isRemote: false,
          costCenter: userData.costCenter,
          client: userData.company,
          dailyFoodVoucher: 33.40,
          dailyTransportVoucher: 11.00,
          company: userData.company,
          currentContract: 'Contrato CLT Padrão',
          bank: userData.bank,
          accountType: userData.accountType,
          agency: userData.agency,
          operation: userData.operation,
          account: userData.account,
          digit: userData.digit,
          pixKeyType: userData.pixKeyType,
          pixKey: userData.pixKey,
          modality: userData.modality,
          familySalary: userData.familySalary,
          dangerPay: userData.dangerPay,
          unhealthyPay: userData.unhealthyPay
        }
      });
      
      console.log(`   ✅ Funcionário criado: ${employee.employeeId}`);
      
      // Gerar pontos batidos
      console.log(`   🕐 Gerando pontos batidos...`);
      const timeRecords = await generateTimeRecords(user.id, employee.id, hireDate);
      
      if (timeRecords.length > 0) {
        await prisma.timeRecord.createMany({
          data: timeRecords
        });
        console.log(`   ✅ ${timeRecords.length} pontos batidos criados`);
      }
      
      userIndex++;
    }
    
    // Criar usuário admin separado
    console.log('\n👑 Criando usuário administrador...');
    const adminCpf = formatCPF(generateCPF());
    const adminBirthDate = generateBirthDate();
    const adminHashedPassword = await bcrypt.hash('123456', 10);
    
    const adminUser = await prisma.user.create({
      data: {
        name: 'Administrador do Sistema',
        email: 'admin@gmail.com',
        password: adminHashedPassword,
        role: 'ADMIN',
        cpf: adminCpf
      }
    });
    
    console.log(`   ✅ Admin criado: ${adminUser.email}`);
    
    console.log('\n🎉 Todos os usuários de teste foram criados com sucesso!');
    console.log('\n📊 Resumo:');
    console.log(`   👥 Funcionários: ${usersData.length}`);
    console.log(`   👑 Admin: 1 (admin@gmail.com)`);
    console.log(`   🏢 Empresas: GENNESIS (14), ABRASIL (15)`);
    console.log(`   🏛️ Centros de Custo: 6 diferentes`);
    console.log(`   🔑 Senha padrão: 123456`);
    console.log(`   🕐 Pontos batidos: 2 anos completos`);
    
  } catch (error) {
    console.error('❌ Erro ao criar usuários de teste:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar script
createTestUsers();
