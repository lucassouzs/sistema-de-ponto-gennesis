import { PrismaClient } from '@prisma/client';
import { licitacaoService } from '../src/services/LicitacaoService';

async function main() {
  const prisma = new PrismaClient();
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM licitacoes`
  );

  let repaired = 0;
  for (const { id } of rows) {
    const before = await prisma.$queryRawUnsafe<Array<{ objeto: string | null }>>(
      `SELECT objeto FROM licitacoes WHERE id = $1`,
      id
    );
    if (before[0]?.objeto?.trim()) continue;

    const data = await licitacaoService.getById(id);
    if (data?.objeto?.trim()) {
      repaired++;
      console.log(`Reparado: ${id} — ${data.numeroProcesso ?? data.objeto.slice(0, 50)}`);
    }
  }

  console.log(`Total reparadas: ${repaired}/${rows.length}`);
  await prisma.$disconnect();
}

main().catch(console.error);
