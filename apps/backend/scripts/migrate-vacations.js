const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function migrateVacations() {
  console.log('🚀 Iniciando migração do sistema de férias...');

  try {
    // Verificar se já existem registros de férias
    const existingVacations = await prisma.vacation.count();
    console.log(`📊 Encontrados ${existingVacations} registros de férias existentes`);

    if (existingVacations > 0) {
      console.log('🔄 Atualizando registros existentes...');
      
      // Buscar todos os funcionários para calcular períodos aquisitivos
      const employees = await prisma.employee.findMany({
        include: {
          user: true
        }
      });

      console.log(`👥 Processando ${employees.length} funcionários...`);

      for (const employee of employees) {
        // Buscar férias do funcionário
        const vacations = await prisma.vacation.findMany({
          where: {
            userId: employee.userId
          }
        });

        if (vacations.length > 0) {
          console.log(`📅 Processando ${vacations.length} férias do funcionário ${employee.user.name}`);

          for (const vacation of vacations) {
            // Calcular períodos aquisitivo e concessivo
            const hireDate = new Date(employee.hireDate);
            const vacationDate = new Date(vacation.startDate);
            
            // Calcular anos trabalhados até a data das férias
            const yearsWorked = Math.floor(
              (vacationDate.getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
            );

            const aquisitiveStart = new Date(hireDate);
            aquisitiveStart.setFullYear(hireDate.getFullYear() + yearsWorked);

            const aquisitiveEnd = new Date(aquisitiveStart);
            aquisitiveEnd.setFullYear(aquisitiveStart.getFullYear() + 1);

            const concessiveEnd = new Date(aquisitiveEnd);
            concessiveEnd.setFullYear(aquisitiveEnd.getFullYear() + 1);

            // Atualizar o registro
            await prisma.vacation.update({
              where: { id: vacation.id },
              data: {
                aquisitiveStart,
                aquisitiveEnd,
                concessiveEnd,
                fraction: null, // Definir como null para férias existentes
                noticeSentAt: vacation.status === 'APPROVED' ? new Date() : null,
                noticeReceivedAt: vacation.status === 'APPROVED' ? new Date() : null
              }
            });
          }
        }
      }

      console.log('✅ Registros existentes atualizados com sucesso!');
    }

    // Verificar configurações da empresa
    const companySettings = await prisma.companySettings.findFirst();
    if (!companySettings) {
      console.log('🏢 Criando configurações padrão da empresa...');
      await prisma.companySettings.create({
        data: {
          name: 'Gênnesis Engenharia',
          cnpj: '00.000.000/0001-00',
          address: 'Endereço da empresa',
          vacationDaysPerYear: 30
        }
      });
      console.log('✅ Configurações da empresa criadas!');
    } else {
      console.log('✅ Configurações da empresa já existem');
    }

    console.log('🎉 Migração concluída com sucesso!');
    console.log('');
    console.log('📋 Próximos passos:');
    console.log('1. Execute: npx prisma generate');
    console.log('2. Execute: npx prisma db push');
    console.log('3. Reinicie o servidor backend');
    console.log('4. Teste as funcionalidades de férias');

  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Executar migração se o script for chamado diretamente
if (require.main === module) {
  migrateVacations()
    .then(() => {
      console.log('✅ Script executado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro ao executar script:', error);
      process.exit(1);
    });
}

module.exports = { migrateVacations };
