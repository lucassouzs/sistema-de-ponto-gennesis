import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  const rows = await p.pncpContratacao.findMany({
    where: { uf: 'DF' },
    select: { dataInclusao: true, syncedAt: true, objeto: true, numeroControlePNCP: true },
    take: 5,
    orderBy: { syncedAt: 'desc' },
  });
  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch(console.error)
  .finally(async () => {
    await p.$disconnect();
  });
