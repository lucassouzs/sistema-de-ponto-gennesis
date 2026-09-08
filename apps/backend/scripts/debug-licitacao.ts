import { PrismaClient } from '@prisma/client';

async function main() {
  const id = process.argv[2] || '307a7538-4c02-4131-b301-5e8f1aad1c71';
  const prisma = new PrismaClient();

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      titulo: string;
      objeto: string | null;
      valorEstimado: string | null;
      vigenciaContrato: string | null;
      numeroProcesso: string | null;
      orgao: string | null;
      modalidade: string | null;
      analiseJson: unknown;
    }>
  >(
    `SELECT titulo, objeto, "valorEstimado", "vigenciaContrato", "numeroProcesso", orgao, modalidade, "analiseJson"
     FROM licitacoes WHERE id = $1`,
    id
  );

  const row = rows[0];
  if (!row) {
    console.log('not found');
    return;
  }

  console.log('COLUNAS:', {
    objeto: row.objeto,
    valorEstimado: row.valorEstimado,
    vigenciaContrato: row.vigenciaContrato,
    numeroProcesso: row.numeroProcesso,
    orgao: row.orgao,
    modalidade: row.modalidade,
  });

  const analise = row.analiseJson as Record<string, unknown> | null;
  console.log('analisePronta:', analise?.analisePronta);
  console.log('resumo len:', typeof analise?.resumoDocumentos === 'string' ? analise.resumoDocumentos.length : 0);

  const ultima = analise?.ultimaExtracao as Record<string, unknown> | undefined;
  console.log('ultimaExtracao:', JSON.stringify(ultima, null, 2)?.slice(0, 2500));

  const bruta = typeof ultima?.respostaBruta === 'string' ? ultima.respostaBruta : '';
  if (bruta) {
    console.log('\n--- respostaBruta HEAD ---\n', bruta.slice(0, 2000));
    console.log('\n--- respostaBruta TAIL ---\n', bruta.slice(-800));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
