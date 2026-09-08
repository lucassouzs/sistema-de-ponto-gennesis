import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const n = await p.pncpContratacao.count();
  const runs = await p.pncpSyncRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 5,
  });
  console.log(JSON.stringify({ n, runs }, null, 2));

  const r = await p.pncpSyncRun.updateMany({
    where: { status: 'running' },
    data: {
      status: 'failed',
      finishedAt: new Date(),
      errorMessage: 'Liberado manualmente (UI travada após restart).',
    },
  });
  console.log('cleared_running', r.count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await p.$disconnect();
  });
