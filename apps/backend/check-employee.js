const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  try {
    console.log('🔍 Verificando dados do funcionário...');
    
    // Buscar funcionário Lucas
    const employee = await prisma.employee.findFirst({
      where: {
        user: {
          name: {
            contains: 'Lucas'
          }
        }
      },
      include: {
        user: true
      }
    });
    
    if (employee) {
      console.log('✅ Funcionário encontrado:');
      console.log('Nome:', employee.user.name);
      console.log('Email:', employee.user.email);
      console.log('Data contratação:', employee.hireDate);
      console.log('Departamento:', employee.department);
      console.log('Salário:', employee.salary);
      
      // Calcular anos trabalhados
      const hireDate = new Date(employee.hireDate);
      const now = new Date();
      const yearsWorked = (now - hireDate) / (365.25 * 24 * 60 * 60 * 1000);
      console.log('Anos trabalhados:', yearsWorked.toFixed(2));
      
      if (yearsWorked >= 1) {
        console.log('✅ Tem direito a férias!');
        const totalDays = Math.floor(yearsWorked) * 30;
        console.log('Dias de férias disponíveis:', totalDays);
      } else {
        console.log('❌ Ainda não tem direito a férias (precisa 1 ano)');
      }
      
      // Verificar férias
      const vacations = await prisma.vacation.findMany({
        where: { userId: employee.userId }
      });
      
      console.log('Férias cadastradas:', vacations.length);
      vacations.forEach(v => {
        console.log('- Férias:', v.startDate, 'a', v.endDate, '(' + v.days + ' dias) -', v.status);
      });
      
    } else {
      console.log('❌ Funcionário Lucas não encontrado!');
      
      // Listar todos os funcionários
      const allEmployees = await prisma.employee.findMany({
        include: { user: true }
      });
      
      console.log('👥 Funcionários cadastrados:');
      allEmployees.forEach(emp => {
        console.log('-', emp.user.name, '(' + emp.department + ') - Contratado em:', emp.hireDate);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
