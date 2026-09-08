import { getPrisma } from '../src/lib/prisma';
import { licitacaoStoreGetById } from '../src/services/licitacaoStore';
import { licitacaoService } from '../src/services/LicitacaoService';

async function main() {
  const rows = await getPrisma().$queryRawUnsafe<Array<{ id: string; titulo: string }>>(
    `SELECT id, titulo FROM licitacoes ORDER BY "updatedAt" DESC LIMIT 1`
  );
  if (!rows[0]) {
    console.log('no licitacao');
    return;
  }
  const id = rows[0].id;
  console.log('Testing id:', id, rows[0].titulo);

  const updated = await licitacaoService.update(id, {
    responsavelAnalise: 'Teste Auto',
    analiseUsuario: 'Analise teste persistencia',
    checklistAnalise: {
      'viabilidade-financeira::valor-estimado': { checked: true, comentario: 'comentario teste' },
    },
  });
  const ck = updated.analiseJson?.checklistAnalise;
  console.log('After update via service:', ck ? Object.keys(ck).length : 'MISSING', ck);

  const raw = await licitacaoStoreGetById(id);
  const rawCk = (raw?.analiseJson as { checklistAnalise?: unknown })?.checklistAnalise;
  console.log('Raw from DB:', rawCk ? JSON.stringify(rawCk).slice(0, 200) : 'MISSING');

  const got = await licitacaoService.getById(id);
  console.log(
    'After getById:',
    got?.analiseJson?.checklistAnalise
      ? Object.keys(got.analiseJson.checklistAnalise).length
      : 'MISSING'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
