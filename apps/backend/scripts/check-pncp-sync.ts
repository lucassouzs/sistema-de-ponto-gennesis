import { prisma } from './src/lib/prisma';

async function main() {
  const count = await prisma.pncpContratacao.count();
  const runs = await prisma.pncpSyncRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 5,
  });
  console.log(JSON.stringify({ count, runs }, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
