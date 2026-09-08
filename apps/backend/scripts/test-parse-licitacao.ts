import { PrismaClient } from '@prisma/client';
import {
  buildExtracaoFromParsed,
  parseLicitacaoResponse,
  repairExtracaoFromRespostaBruta,
  hasMainLicitacaoFields,
} from '../src/services/licitacaoFieldExtraction';

async function main() {
  const id = process.argv[2] || '307a7538-4c02-4131-b301-5e8f1aad1c71';
  const prisma = new PrismaClient();
  const rows = await prisma.$queryRawUnsafe<Array<{ analiseJson: unknown }>>(
    `SELECT "analiseJson" FROM licitacoes WHERE id = $1`,
    id
  );
  const analise = rows[0]?.analiseJson as Record<string, unknown> | undefined;
  const bruta = (analise?.ultimaExtracao as Record<string, unknown> | undefined)?.respostaBruta;
  if (typeof bruta !== 'string') {
    console.log('sem respostaBruta');
    return;
  }
  const parsed = parseLicitacaoResponse(bruta);
  console.log('parsed keys:', parsed ? Object.keys(parsed) : null);
  console.log('parsed objeto:', parsed?.objeto);
  const empty = buildExtracaoFromParsed(null);
  const repaired = repairExtracaoFromRespostaBruta(empty, bruta);
  console.log('repaired:', repaired);
  console.log('hasMain:', hasMainLicitacaoFields(repaired));
  await prisma.$disconnect();
}

main().catch(console.error);
