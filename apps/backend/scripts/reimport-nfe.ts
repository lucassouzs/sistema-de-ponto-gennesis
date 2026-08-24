import '../src/loadEnv';
import { prisma } from '../src/lib/prisma';
import { NfeRecebidaService } from '../src/services/NfeRecebidaService';

async function main() {
  const before = await prisma.nfeRecebida.count();
  console.log('antes:', before);
  const svc = new NfeRecebidaService();
  const result = await svc.reimportLocal({
    periodFrom: '2026-01-01',
    periodTo: '2026-12-31'
  });
  const after = await prisma.nfeRecebida.count();
  console.log('depois:', after);
  console.log(result);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
