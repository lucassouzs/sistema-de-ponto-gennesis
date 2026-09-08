import type { AdmFormRequestType } from './AdmTstSolicitacaoTypeFields';
import type { DpFormRequestType } from './DpSolicitacaoTypeFields';

export type DpRequestTypeKey = DpFormRequestType | AdmFormRequestType;

export function getInitialSolicitacaoDetails(
  requestType: DpRequestTypeKey | ''
): Record<string, unknown> {
  switch (requestType) {
    case 'ADMISSAO':
      return { candidatos: [{ nome: '', funcao: '', contato: '', motivoContratacao: '', setor: '', observacao: '' }] };
    case 'ADVERTENCIA_SUSPENSAO':
      return { medidas: [{ employeeId: '', punicao: '', motivo: '' }] };
    case 'FERIAS':
      return { ferias: [{ employeeId: '', dataInicial: '', dataFinal: '', observacao: '' }] };
    case 'RESCISAO':
      return {
        rescisoes: [
          {
            employeeId: '',
            tipoAviso: '',
            tipoRescisao: '',
            motivo: '',
            observacoes: '',
          },
        ],
      };
    case 'ALTERACAO_FUNCAO_SALARIO':
      return {
        alteracoes: [
          {
            employeeId: '',
            tipoAlteracaoFuncaoOuSalario: 'FUNCAO',
            funcaoSalarioAntigo: '',
            funcaoSalarioNovo: '',
            justificativa: '',
          },
        ],
      };
    case 'ATESTADO_MEDICO':
      return {
        atestados: [
          { employeeId: '', dataInicial: '', dataFinal: '', numeroDias: '' },
        ],
      };
    case 'RETIFICACAO_ALOCACAO':
      return { retificacoes: [{ employeeId: '', data: '', justificativa: '' }] };
    case 'HORA_EXTRA':
      return { horasExtras: [{ employeeId: '', justificativa: '', datas: '' }] };
    case 'BENEFICIOS_VIAGEM':
      return {
        viagensBeneficio: [
          {
            employeeId: '',
            dataInicial: '',
            dataFinal: '',
            numeroDias: '',
            diasHotel: '',
            motivoViagem: '',
          },
        ],
      };
    case 'OUTRAS_SOLICITACOES':
      return {
        itens: [
          {
            employeeId: '',
            tipoSolicitacao: '',
            situacao: '',
            justificativa: '',
            datas: '',
            valores: '',
            observacoes: '',
          },
        ],
      };
    case 'ADM_VIAGENS':
      return {
        viagens: [
          {
            employeeId: '',
            dataIda: '',
            dataVolta: '',
            cidade: '',
            motivoViagem: '',
            numeroDias: '',
            pedagio: '',
            observacoes: '',
          },
        ],
      };
    case 'ADM_EPI_FARDAMENTO':
    case 'ADM_MANUTENCAO_ESCRITORIO':
    case 'ADM_MATERIAL_ESCRITORIO':
    case 'ADM_INFORMATICA':
    case 'ADM_TREINAMENTOS_NR':
      return { itens: [{ employeeId: '', detalhes: '' }] };
    case 'ADM_ASOS':
      return {
        asos: [
          {
            asoTipo: '',
            employeeId: '',
            dataNascimento: '',
            cpf: '',
            setor: '',
            cargo: '',
            novoCargo: '',
            centroCusto: '',
            localTrabalho: '',
            empresa: '',
            seguirPcmso: '',
          },
        ],
      };
    default:
      return {};
  }
}
