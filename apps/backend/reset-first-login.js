const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function resetFirstLogin() {
  try {
    // Resetar isFirstLogin para true para todos os usuários
    const result = await prisma.user.updateMany({
      data: {
        isFirstLogin: true
      }
    });

    console.log(`Resetado isFirstLogin para ${result.count} usuários`);
  } catch (error) {
    console.error('Erro ao resetar isFirstLogin:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetFirstLogin();
