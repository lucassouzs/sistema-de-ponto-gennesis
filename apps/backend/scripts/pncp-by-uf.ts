import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const byUf = await p.pncpContratacao.groupBy({
    by: ['uf'],
    _count: true,
    orderBy: { _count: { uf: 'desc' } },
  });
  console.log(JSON.stringify(byUf, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await p.$disconnect();
  });
