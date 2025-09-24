const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function createTestEmployee() {
  try {
    console.log('🧪 Criando funcionário de teste com direito a férias...');
    
    // Data de contratação há 2 anos (para ter direito a férias)
    const hireDate = new Date();
    hireDate.setFullYear(hireDate.getFullYear() - 2);
    
    // Criar usuário
    const hashedPassword = await bcrypt.hash('123456', 12);
    
    const user = await prisma.user.create({
      data: {
        email: 'joao.teste@gennesis.com',
        password: hashedPassword,
        name: 'João Silva Teste',
        cpf: '123.456.789-00',
        role: 'EMPLOYEE'
      }
    });
    
    console.log('✅ Usuário criado:', user.name);
    
    // Criar funcionário
    const employee = await prisma.employee.create({
      data: {
        userId: user.id,
        employeeId: 'EMP002',
        department: 'Desenvolvimento',
        position: 'Desenvolvedor Senior',
        hireDate: hireDate,
        salary: 5000,
        workSchedule: {
          startTime: '08:00',
          endTime: '17:00',
          lunchStart: '12:00',
          lunchEnd: '13:00'
        },
        isRemote: false
      }
    });
    
    console.log('✅ Funcionário criado:', employee.employeeId);
    console.log('📅 Data contratação:', employee.hireDate.toLocaleDateString('pt-BR'));
    
    // Calcular anos trabalhados
    const yearsWorked = (new Date() - hireDate) / (365.25 * 24 * 60 * 60 * 1000);
    console.log('⏰ Anos trabalhados:', yearsWorked.toFixed(2));
    
    if (yearsWorked >= 1) {
      const totalDays = Math.floor(yearsWorked) * 30;
      console.log('🏖️ Dias de férias disponíveis:', totalDays);
    }
    
    console.log('');
    console.log('🎉 Funcionário de teste criado!');
    console.log('📧 Email: joao.teste@gennesis.com');
    console.log('🔑 Senha: 123456');
    console.log('🏖️ Agora você pode testar o sistema de férias!');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestEmployee();
