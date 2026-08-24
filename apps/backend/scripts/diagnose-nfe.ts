import '../src/loadEnv';
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/lib/prisma';

async function main() {
  const state = await prisma.nfeDistribuicaoState.findUnique({ where: { id: 'default' } });
  console.log('== state ==');
  console.log('ultimoNsu:', state?.ultimoNsu);
  console.log('lastFetchAt:', state?.lastFetchAt?.toISOString());
  console.log('lastMessage:', state?.lastMessage);

  const total = await prisma.nfeRecebida.count();
  const de2026 = await prisma.nfeRecebida.count({
    where: {
      dataEmissao: {
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-12-31T23:59:59.999Z'),
      },
    },
  });
  const semData = await prisma.nfeRecebida.count({ where: { dataEmissao: null } });
  console.log('\n== totais ==');
  console.log('total no banco:', total);
  console.log('emissão em 2026:', de2026);
  console.log('sem data de emissão:', semData);

  const porDia = await prisma.$queryRawUnsafe<Array<{ dia: string; qtd: bigint }>>(
    `SELECT to_char(data_emissao, 'YYYY-MM-DD') AS dia, count(*) AS qtd
       FROM nfe_recebidas
      WHERE data_emissao >= '2026-08-15'
      GROUP BY 1 ORDER BY 1 DESC`
  );
  console.log('\n== emissões desde 15/08 ==');
  for (const r of porDia) console.log(r.dia, Number(r.qtd));

  const recentes = await prisma.nfeRecebida.findMany({
    orderBy: { fetchedAt: 'desc' },
    take: 10,
    select: {
      numero: true,
      emitNome: true,
      dataEmissao: true,
      fetchedAt: true,
      schema: true,
      xmlFileName: true,
    },
  });
  console.log('\n== 10 últimas gravadas (fetchedAt) ==');
  for (const r of recentes) {
    console.log(
      r.fetchedAt.toISOString(),
      '| emissão:',
      r.dataEmissao?.toISOString().slice(0, 10) ?? 'null',
      '|',
      r.numero,
      '|',
      (r.emitNome || '').slice(0, 32),
      '|',
      r.schema,
      '|',
      r.xmlFileName
    );
  }

  const xmlDir = path.resolve(process.cwd(), 'data', 'nfe-xmls');
  if (fs.existsSync(xmlDir)) {
    const files = fs.readdirSync(xmlDir).filter((f) => f.toLowerCase().endsWith('.xml'));
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const novosHoje = files.filter((f) => {
      const st = fs.statSync(path.join(xmlDir, f));
      return st.mtime >= hoje;
    });
    console.log('\n== pasta data/nfe-xmls ==');
    console.log('arquivos XML:', files.length);
    console.log('arquivos baixados hoje:', novosHoje.length);
    console.log(novosHoje.slice(0, 10).join('\n'));
  } else {
    console.log('\npasta data/nfe-xmls não existe em', xmlDir);
  }

  console.log('\n== env ==');
  console.log('NFE_JAVA_ENABLED:', process.env.NFE_JAVA_ENABLED);
  console.log('NFE_XML_DIR:', process.env.NFE_XML_DIR);
  console.log('NFE_AUTO_FETCH_YEAR:', process.env.NFE_AUTO_FETCH_YEAR);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
