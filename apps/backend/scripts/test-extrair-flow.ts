import { PrismaClient } from '@prisma/client';
import {
  buildExtracaoFromParsed,
  parseLicitacaoResponse,
  repairExtracaoFromRespostaBruta,
  hasMainLicitacaoFields,
  mergeExtracaoPreferFilled,
} from '../src/services/licitacaoFieldExtraction';

async function main() {
  const prisma = new PrismaClient();
  const id = '307a7538-4c02-4131-b301-5e8f1aad1c71';
  const rows = await prisma.$queryRawUnsafe<Array<{ analiseJson: unknown }>>(
    `SELECT "analiseJson" FROM licitacoes WHERE id = $1`,
    id
  );
  const bruta = (rows[0]?.analiseJson as any)?.ultimaExtracao?.respostaBruta as string;
  console.log('bruta len:', bruta?.length);

  let extracao = buildExtracaoFromParsed(null);
  const parsed = parseLicitacaoResponse(bruta);
  console.log('parsed objeto:', parsed?.objeto?.slice?.(0, 80));
  if (parsed) extracao = mergeExtracaoPreferFilled(extracao, buildExtracaoFromParsed(parsed));
  console.log('after merge hasMain:', hasMainLicitacaoFields(extracao));
  extracao = repairExtracaoFromRespostaBruta(extracao, bruta);
  console.log('after repair:', {
    objeto: extracao.objeto?.slice(0, 60),
    vigencia: extracao.vigenciaContrato,
    processo: extracao.numeroProcesso,
    orgao: extracao.orgao,
    modalidade: extracao.modalidade?.slice(0, 60),
    hasMain: hasMainLicitacaoFields(extracao),
  });
  await prisma.$disconnect();
}

main().catch(console.error);
