import api from './api';
import { readApiData } from './http';

export type DpUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type DpRequestStatus =
  | 'WAITING_MANAGER'
  | 'IN_REVIEW_DP'
  | 'IN_FINANCEIRO'
  | 'WAITING_RETURN'
  | 'WAITING_RETURN_ACCOUNTING'
  | 'WAITING_RETURN_ADM_TST'
  | 'WAITING_RETURN_ENGINEERING'
  | 'WAITING_SUPPLIES'
  | 'WAITING_PAYMENT'
  | 'CONCLUDED'
  | 'CANCELLED';

export type DpRequestType =
  | 'ADMISSAO'
  | 'ADVERTENCIA_SUSPENSAO'
  | 'ALTERACAO_FUNCAO_SALARIO'
  | 'ATESTADO_MEDICO'
  | 'BENEFICIOS_VIAGEM'
  | 'FERIAS'
  | 'HORA_EXTRA'
  | 'OUTRAS_SOLICITACOES'
  | 'RESCISAO'
  | 'RETIFICACAO_ALOCACAO'
  | 'ADM_VIAGENS'
  | 'ADM_EPI_FARDAMENTO'
  | 'ADM_MANUTENCAO_ESCRITORIO'
  | 'ADM_MATERIAL_ESCRITORIO'
  | 'ADM_INFORMATICA'
  | 'ADM_TREINAMENTOS_NR'
  | 'ADM_ASOS';

export type DpEligibleContract = {
  id: string;
  name: string;
  number?: string;
  costCenterId?: string;
  costCenter?: {
    company?: string | null;
    polo?: string | null;
    name?: string | null;
    code?: string | null;
  };
};

export type DpRequest = {
  id: string;
  displayNumber?: number | null;
  urgency: DpUrgency;
  requestType: DpRequestType;
  status: DpRequestStatus;
  contractId?: string | null;
  company?: string | null;
  polo?: string | null;
  prazoInicio?: string | null;
  prazoFim?: string | null;
  details?: Record<string, unknown> | null;
  createdAt: string;
  requesterReturnComment?: string | null;
  dpFeedback?: string | null;
  contract?: { id: string; name?: string; number?: string } | null;
  employee?: { id: string; department?: string; user?: { name?: string } } | null;
};

export type PayrollEmployeeOption = {
  id: string;
  name: string;
  department?: string;
  position?: string;
  cpf?: string;
  company?: string | null;
  polo?: string | null;
  costCenter?: string | null;
  birthDate?: string | null;
};

export const DP_TYPE_LABELS: Record<string, string> = {
  ADMISSAO: 'Admissão',
  ADVERTENCIA_SUSPENSAO: 'Medida disciplinar',
  ALTERACAO_FUNCAO_SALARIO: 'Alteração de função/salário',
  ATESTADO_MEDICO: 'Atestado médico',
  BENEFICIOS_VIAGEM: 'Benefícios de viagem',
  FERIAS: 'Férias',
  HORA_EXTRA: 'Hora extra',
  OUTRAS_SOLICITACOES: 'Outras solicitações',
  RESCISAO: 'Rescisão',
  RETIFICACAO_ALOCACAO: 'Retificação de alocação',
  ADM_VIAGENS: 'Viagens',
  ADM_EPI_FARDAMENTO: "EPI's e fardamento",
  ADM_MANUTENCAO_ESCRITORIO: 'Manutenção do escritório',
  ADM_MATERIAL_ESCRITORIO: 'Material de escritório',
  ADM_INFORMATICA: 'Informática',
  ADM_TREINAMENTOS_NR: "Treinamentos e NR's",
  ADM_ASOS: "ASO's",
};

export const ADM_SIMPLE_TYPES = [
  'ADM_EPI_FARDAMENTO',
  'ADM_MANUTENCAO_ESCRITORIO',
  'ADM_MATERIAL_ESCRITORIO',
  'ADM_INFORMATICA',
  'ADM_TREINAMENTOS_NR',
] as const;

export const URGENCY_LABELS: Record<DpUrgency, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export const STATUS_LABELS: Record<DpRequestStatus, string> = {
  WAITING_MANAGER: 'Aguardando aprovação',
  IN_REVIEW_DP: 'Em análise',
  IN_FINANCEIRO: 'No financeiro',
  WAITING_RETURN: 'Sua pendência',
  WAITING_RETURN_ACCOUNTING: 'Pendência contábil',
  WAITING_RETURN_ADM_TST: 'Pendência ADM/TST',
  WAITING_RETURN_ENGINEERING: 'Pendência engenharia',
  WAITING_SUPPLIES: 'Aguardando setor de suprimentos',
  WAITING_PAYMENT: 'Aguardando pagamento',
  CONCLUDED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

export function isAdmTstRequestType(requestType: string): boolean {
  return requestType.startsWith('ADM_');
}

export function destinationLabel(requestType: string): string {
  return isAdmTstRequestType(requestType) ? 'ADM/TST' : 'Departamento Pessoal';
}

export async function fetchMyDpRequests(status = 'all'): Promise<DpRequest[]> {
  const q = status && status !== 'all' ? `?status=${encodeURIComponent(status)}` : '';
  const res = await api.get(`/api/solicitacoes-dp/minhas${q}`);
  return (await readApiData<DpRequest[]>(res)) || [];
}

export async function fetchEligibleContracts(): Promise<DpEligibleContract[]> {
  const res = await api.get('/api/solicitacoes-dp/contratos-elegiveis');
  return (await readApiData<DpEligibleContract[]>(res)) || [];
}

export async function fetchPayrollEmployees(): Promise<PayrollEmployeeOption[]> {
  const n = new Date();
  const params = new URLSearchParams({
    month: String(n.getMonth() + 1),
    year: String(n.getFullYear()),
    limit: '500',
    page: '1',
  });
  const res = await api.get(`/api/payroll/employees?${params.toString()}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.message || json?.error || 'Erro ao carregar colaboradores');
  }
  return (json?.data?.employees ?? []) as PayrollEmployeeOption[];
}

export async function createDpRequest(payload: {
  urgency: DpUrgency;
  requestType: DpRequestType;
  contractId: string;
  company?: string;
  polo?: string;
  prazoInicio?: string;
  prazoFim?: string;
  details?: Record<string, unknown>;
}): Promise<DpRequest> {
  const res = await api.post('/api/solicitacoes-dp', payload);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    const details =
      Array.isArray(json?.details) && json.details[0]?.message
        ? json.details.map((d: any) => d.message).join('; ')
        : null;
    throw new Error(details || json?.error || json?.message || 'Falha ao criar solicitação');
  }
  const json = await res.json();
  return json.data as DpRequest;
}

export async function submitRequesterReturn(id: string, comment: string): Promise<DpRequest> {
  const res = await api.put(`/api/solicitacoes-dp/${id}/requester-return`, { comment });
  return readApiData<DpRequest>(res);
}
