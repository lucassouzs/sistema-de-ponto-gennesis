import '../src/loadEnv';
import { prisma } from '../src/lib/prisma';

async function main() {
  const state = await prisma.nfeDistribuicaoState.findUnique({ where: { id: 'default' } });
  if (state?.lastMessage && /reimporta/i.test(state.lastMessage)) {
    await prisma.nfeDistribuicaoState.update({
      where: { id: 'default' },
      data: { lastMessage: null }
    });
    console.log('lastMessage de reimportação removida');
  } else {
    console.log('nada a limpar:', state?.lastMessage ?? '(vazio)');
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
