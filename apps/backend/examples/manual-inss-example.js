// Exemplo de como inserir valores manuais de INSS
// Este arquivo demonstra como usar a nova funcionalidade

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function exemploInserirValoresManuais() {
  try {
    console.log('=== EXEMPLO: Inserir Valores Manuais de INSS ===');
    
    // Exemplo 1: Inserir valores para um funcionário específico
    const exemplo1 = await prisma.manualInssValue.upsert({
      where: {
        employeeId_month_year: {
          employeeId: 'EMPLOYEE_ID_AQUI', // Substitua pelo ID real do funcionário
          month: 12, // Dezembro
          year: 2024
        }
      },
      update: {
        inssRescisao: 150.00, // R$ 150,00
        inss13: 200.00        // R$ 200,00
      },
      create: {
        employeeId: 'EMPLOYEE_ID_AQUI', // Substitua pelo ID real do funcionário
        month: 12,
        year: 2024,
        inssRescisao: 150.00,
        inss13: 200.00
      }
    });
    
    console.log('✅ Valores inseridos:', exemplo1);
    
    // Exemplo 2: Buscar valores existentes
    const valoresExistentes = await prisma.manualInssValue.findMany({
      where: {
        month: 12,
        year: 2024
      },
      include: {
        employee: {
          include: {
            user: {
              select: {
                name: true,
                cpf: true
              }
            }
          }
        }
      }
    });
    
    console.log('\n📋 Valores existentes para Dezembro/2024:');
    valoresExistentes.forEach(valor => {
      console.log(`- ${valor.employee.user.name} (${valor.employee.user.cpf}):`);
      console.log(`  INSS Rescisão: R$ ${valor.inssRescisao}`);
      console.log(`  INSS 13°: R$ ${valor.inss13}`);
    });
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Executar exemplo
exemploInserirValoresManuais();
