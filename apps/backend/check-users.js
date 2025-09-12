const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkUsers() {
  try {
    // Contar todos os usuários
    const allUsers = await prisma.user.count();
    console.log('Total de usuários:', allUsers);

    // Contar usuários ativos
    const activeUsers = await prisma.user.count({ where: { isActive: true } });
    console.log('Usuários ativos:', activeUsers);

    // Contar funcionários ativos
    const employees = await prisma.user.count({ 
      where: { 
        role: 'EMPLOYEE', 
        isActive: true 
      } 
    });
    console.log('Funcionários ativos:', employees);

    // Contar funcionários com dados de employee
    const employeesWithData = await prisma.user.count({ 
      where: { 
        role: 'EMPLOYEE', 
        isActive: true,
        employee: {
          isNot: null
        }
      } 
    });
    console.log('Funcionários com dados completos:', employeesWithData);

    // Listar todos os usuários com seus roles
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        employee: {
          select: {
            employeeId: true,
            department: true
          }
        }
      }
    });

    console.log('\nLista de usuários:');
    users.forEach(user => {
      console.log(`- ${user.name} (${user.email}) - Role: ${user.role}, Ativo: ${user.isActive}, Employee: ${user.employee ? 'Sim' : 'Não'}`);
    });

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkUsers();
