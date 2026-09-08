import api from '@/lib/api';
import type { CronogramaComposicaoRef, EtapaPrazoPayload } from './orcamentoCronogramaTypes';

export type GerarSubServicosPayload = {
  servicoId: string;
  servicoNome: string;
  subtituloNome?: string;
  dataInicioObra?: string;
  dataFimObra?: string;
  composicoes: CronogramaComposicaoRef[];
};

export type SubServicoGeradoApi = {
  nome: string;
  composicaoChave?: string;
  observacao?: string;
};

export type EstimarPrazosPayload = {
  dataInicioObra: string;
  dataFimObra: string;
  etapas: EtapaPrazoPayload[];
};

export type EtapaPrazoEstimadoApi = {
  etapaKey: string;
  diasEstimados: number;
};

export async function estimarPrazosCronograma(
  centroCustoId: string,
  orcamentoId: string,
  payload: EstimarPrazosPayload
): Promise<{ etapas: EtapaPrazoEstimadoApi[]; origem: 'ia' | 'heuristica' }> {
  const res = await api.post(
    `/orcamento/${centroCustoId}/orcamentos/${orcamentoId}/cronograma/estimar-prazos`,
    {
      dataInicioObra: payload.dataInicioObra,
      dataFimObra: payload.dataFimObra,
      etapas: payload.etapas.map((e) => ({
        etapaKey: e.etapaKey,
        servicoNome: e.servicoNome,
        etapaNome: e.etapaNome,
        valorTotal: e.valorTotal,
        composicoes: e.composicoes.map((c) => ({
          chave: c.chave,
          codigo: c.codigo,
          descricao: c.descricao,
          subtitulo: c.subtituloNome,
          unidade: c.unidade,
          quantidade: c.quantidade
        }))
      }))
    },
    { timeout: 180_000 }
  );
  return res.data;
}

export async function gerarSubServicosCronograma(
  centroCustoId: string,
  orcamentoId: string,
  payload: GerarSubServicosPayload
): Promise<{ subServicos: SubServicoGeradoApi[]; origem: 'ia' | 'heuristica' }> {
  const res = await api.post(
    `/orcamento/${centroCustoId}/orcamentos/${orcamentoId}/cronograma/gerar-sub-servicos`,
    {
      servicoId: payload.servicoId,
      servicoNome: payload.servicoNome,
      subtituloNome: payload.subtituloNome,
      dataInicioObra: payload.dataInicioObra,
      dataFimObra: payload.dataFimObra,
      composicoes: payload.composicoes.map((c) => ({
        chave: c.chave,
        codigo: c.codigo,
        descricao: c.descricao,
        subtitulo: c.subtituloNome,
        unidade: c.unidade,
        quantidade: c.quantidade
      }))
    }
  );
  return res.data;
}
