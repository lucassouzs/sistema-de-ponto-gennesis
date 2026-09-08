import { licitacaoService } from '../src/services/LicitacaoService';

async function main() {
  const id = '307a7538-4c02-4131-b301-5e8f1aad1c71';
  const data = await licitacaoService.getById(id);
  console.log('API getById:', {
    objeto: data?.objeto?.slice(0, 80),
    valorEstimado: data?.valorEstimado,
    vigenciaContrato: data?.vigenciaContrato,
    numeroProcesso: data?.numeroProcesso,
    orgao: data?.orgao,
    modalidade: data?.modalidade?.slice(0, 80),
    ultimaObjeto: (data?.analiseJson?.ultimaExtracao as any)?.objeto?.slice(0, 80),
  });
}

main().catch(console.error);
