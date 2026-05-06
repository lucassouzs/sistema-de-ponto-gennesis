'use client';

import React, { useMemo, useState } from 'react';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { FileCheck, FileText, Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

type DpUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type DpRequestStatus =
  | 'WAITING_MANAGER'
  | 'IN_REVIEW_DP'
  | 'IN_FINANCEIRO'
  | 'WAITING_RETURN'
  | 'WAITING_RETURN_ACCOUNTING'
  | 'WAITING_RETURN_ADM_TST'
  | 'WAITING_RETURN_ENGINEERING'
  | 'CONCLUDED'
  | 'CANCELLED';
type DpRequestType =
  | 'ADMISSAO'
  | 'ADVERTENCIA_SUSPENSAO'
  | 'ALTERACAO_FUNCAO_SALARIO'
  | 'ATESTADO_MEDICO'
  | 'BENEFICIOS_VIAGEM'
  | 'FERIAS'
  | 'HORA_EXTRA'
  | 'OUTRAS_SOLICITACOES'
  | 'RESCISAO'
  | 'RETIFICACAO_ALOCACAO';

type DpContractSummary = { id: string; number: string; name: string };

type DpRequest = {
  id: string;
  displayNumber?: number;
  title: string;
  status: DpRequestStatus;
  urgency: DpUrgency;
  requestType: DpRequestType;
  prazoInicio: string;
  prazoFim: string;
  sectorSolicitante: string;
  solicitanteNome: string;
  solicitanteEmail: string;
  contractId?: string | null;
  contract?: DpContractSummary | null;
  company?: string | null;
  polo?: string | null;
  managerApprovalComment?: string | null;
  managerRejectionReason?: string | null;
  createdAt?: string;
  details?: Record<string, unknown> | null;
};

const STATUS_LABELS: Record<DpRequestStatus, string> = {
  WAITING_MANAGER: 'Aguardando aprovação do gestor',
  IN_REVIEW_DP: 'Em análise (DP)',
  IN_FINANCEIRO: 'No financeiro',
  WAITING_RETURN: 'Pendência colaborador',
  WAITING_RETURN_ACCOUNTING: 'Pendência contábil',
  WAITING_RETURN_ADM_TST: 'Pendência ADM/TST',
  WAITING_RETURN_ENGINEERING: 'Pendência engenharia',
  CONCLUDED: 'Concluída',
  CANCELLED: 'Cancelada',
};

/** Rótulos legíveis para chaves comuns em `details` (formulário por tipo). */
const DETAIL_KEY_LABELS: Record<string, string> = {
  employeeId: 'Colaborador',
  employeeIds: 'Colaboradores',
  punicao: 'Punição',
  motivo: 'Motivo',
  observacao: 'Observação',
  observacoes: 'Observações',
  setor: 'Setor',
  dataInicial: 'Data inicial',
  dataFinal: 'Data final',
  quantidadeNomeFuncaoContato: 'Qtd. / nome / função / contato',
  funcaoNomeQuantidadeContato: 'Função / nome / qtd. / contato',
  motivoContratacao: 'Motivo da contratação',
  funcaoSalarioAntigo: 'Função/salário (anterior)',
  funcaoSalarioNovo: 'Função/salário (novo)',
  justificativa: 'Justificativa',
  tipoAviso: 'Tipo de aviso',
  tipoRescisao: 'Tipo de rescisão',
  destinoViagem: 'Destino (viagem)',
  periodo: 'Período',
  horas: 'Horas',
  valor: 'Valor',
  descricao: 'Descrição',
};

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

function humanizeDetailKey(key: string): string {
  if (DETAIL_KEY_LABELS[key]) return DETAIL_KEY_LABELS[key];
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

function formatDetailValue(val: unknown): string {
  if (val == null) return '';
  if (Array.isArray(val)) {
    if (val.length === 0) return '';
    return val.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function formatDetailEntryValue(
  key: string,
  v: unknown,
  employeeNameById?: Map<string, string>
): string {
  if (employeeNameById && key === 'employeeId' && typeof v === 'string') {
    const id = v.trim();
    if (!id) return '';
    const name = employeeNameById.get(id);
    return (name ?? id).trim();
  }
  if (employeeNameById && key === 'employeeIds' && Array.isArray(v)) {
    const parts = v
      .map((x) => {
        const id = String(x).trim();
        if (!id) return '';
        return employeeNameById.get(id) ?? id;
      })
      .filter(Boolean);
    return parts.join(', ');
  }
  return formatDetailValue(v);
}

function buildDetailRows(
  details: Record<string, unknown> | null | undefined,
  employeeNameById?: Map<string, string>
): { key: string; label: string; value: string }[] {
  if (!details || typeof details !== 'object') return [];
  const rows: { key: string; label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(details)) {
    const value = formatDetailEntryValue(k, v, employeeNameById).trim();
    if (!value) continue;
    rows.push({ key: k, label: humanizeDetailKey(k), value });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

function formatYmd(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

const URGENCY_LABELS: Record<DpUrgency, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

const URGENCY_ROW_BADGE: Record<DpUrgency, string> = {
  LOW: 'text-yellow-800 dark:text-yellow-300',
  MEDIUM: 'text-yellow-800 dark:text-yellow-300',
  HIGH: 'text-red-700 dark:text-red-300',
  URGENT: 'text-red-700 dark:text-red-300',
};

/** Mesmo padrão do botão de ações na lista de funcionários (quadrado 9×9 com borda). */
const TABLE_ACTION_ICON_BTN_CLASS =
  'inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors';

const TYPE_LABELS: Record<DpRequestType, string> = {
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
};

export default function AprovacoesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [managerComment, setManagerComment] = useState<Record<string, string>>({});
  const [detailRequest, setDetailRequest] = useState<DpRequest | null>(null);

  const { canAccessDpApproverPages } = usePermissions();
  const canApproveDp = canAccessDpApproverPages;

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });
  const user = userData?.data;

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: dpResp, isLoading: loadingDp } = useQuery({
    queryKey: ['approvals', 'dp', 'WAITING_MANAGER'],
    queryFn: async () => {
      const res = await api.get('/solicitacoes-dp/aprovacoes');
      return (res.data?.data ?? []) as DpRequest[];
    },
    enabled: !loadingUser && canApproveDp,
  });

  const dpRequests = (dpResp as DpRequest[]) || [];

  const detailPayrollMonthYear = React.useMemo(() => {
    const src = detailRequest?.createdAt;
    if (!src) {
      const n = new Date();
      return { month: n.getMonth() + 1, year: n.getFullYear() };
    }
    const d = new Date(src);
    if (Number.isNaN(d.getTime())) {
      const n = new Date();
      return { month: n.getMonth() + 1, year: n.getFullYear() };
    }
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }, [detailRequest?.createdAt]);

  const { data: payrollEmpForDetail } = useQuery({
    queryKey: [
      'payroll-employees-aprovacoes-detalhe',
      detailPayrollMonthYear.month,
      detailPayrollMonthYear.year,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        month: String(detailPayrollMonthYear.month),
        year: String(detailPayrollMonthYear.year),
        limit: '500',
        page: '1',
      });
      const res = await api.get(`/payroll/employees?${params.toString()}`);
      return (res.data?.data?.employees ?? []) as { id: string; name: string }[];
    },
    enabled: !loadingUser && canApproveDp && !!detailRequest,
  });

  const employeeNameByIdForDetail = React.useMemo(() => {
    const list = payrollEmpForDetail ?? [];
    return new Map(list.map((e) => [e.id, e.name]));
  }, [payrollEmpForDetail]);

  const detailModalRows = React.useMemo(
    () => (detailRequest ? buildDetailRows(detailRequest.details, employeeNameByIdForDetail) : []),
    [detailRequest, employeeNameByIdForDetail]
  );

  const dpFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dpRequests;
    return dpRequests.filter((r) => {
      if (r.displayNumber != null && String(r.displayNumber).includes(q)) return true;
      return r.id.toLowerCase().includes(q);
    });
  }, [dpRequests, search]);

  const approveMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const comment = managerComment[id] || '';
      const res = await api.put(`/solicitacoes-dp/${id}/manager-approve`, { comment });
      return res.data?.data as DpRequest;
    },
    onSuccess: async (_, variables) => {
      toast.success('Solicitação aprovada');
      setDetailRequest((cur) => (cur?.id === variables.id ? null : cur));
      await queryClient.invalidateQueries({ queryKey: ['approvals', 'dp', 'WAITING_MANAGER'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || err?.message || 'Erro'),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const comment = managerComment[id] || '';
      const res = await api.put(`/solicitacoes-dp/${id}/manager-reject`, { comment });
      return res.data?.data as DpRequest;
    },
    onSuccess: async (_, variables) => {
      toast.success('Solicitação rejeitada');
      setDetailRequest((cur) => (cur?.id === variables.id ? null : cur));
      await queryClient.invalidateQueries({ queryKey: ['approvals', 'dp', 'WAITING_MANAGER'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || err?.message || 'Erro'),
  });

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/aprovacoes">
      <MainLayout userRole={'EMPLOYEE'} userName={user?.name || ''} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Aprovações</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Caixa de entrada de aprovações pendentes
            </p>
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <FileCheck className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Solicitações</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Pendentes de aprovação
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por Nº ou ID..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!canApproveDp ? (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Você não tem permissão para aprovar solicitações do Departamento Pessoal.
                </div>
              ) : loadingDp ? (
                <Loading message="Carregando aprovações..." />
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {dpFiltered.length === 0 ? 0 : 1} a {dpFiltered.length} de {dpFiltered.length}{' '}
                      solicitações
                    </span>
                    <span>Página 1 de 1</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Nº
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Urgência
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Tipo
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Contrato
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Prazo início
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Prazo fim
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Solicitante
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {dpFiltered.map((r) => (
                          <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                              {r.displayNumber ?? '—'}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-center">
                              <span
                                className={`inline-flex items-center justify-center text-xs font-medium ${URGENCY_ROW_BADGE[r.urgency]}`}
                              >
                                {URGENCY_LABELS[r.urgency]}
                              </span>
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm font-medium text-gray-900 dark:text-gray-100">
                              {TYPE_LABELS[r.requestType] ?? r.requestType}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 max-w-[220px]">
                              {r.contract?.name ?? '—'}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                              {formatYmd(r.prazoInicio)}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                              {formatYmd(r.prazoFim)}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                              <div className="font-medium text-gray-900 dark:text-gray-100">{r.solicitanteNome}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{r.sectorSolicitante}</div>
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-center">
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => setDetailRequest(r)}
                                  className={TABLE_ACTION_ICON_BTN_CLASS}
                                  title="Ver detalhes"
                                  aria-label="Ver detalhes da solicitação"
                                >
                                  <FileText className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {dpFiltered.length === 0 && (
                          <tr>
                            <td className="py-8 text-center text-gray-500" colSpan={8}>
                              Nenhuma aprovação pendente.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Modal
            isOpen={!!detailRequest}
            onClose={() => setDetailRequest(null)}
            title={
              detailRequest
                ? `Solicitação`
                : 'Detalhes'
            }
            size="lg"
          >
            {detailRequest && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Status:</span>{' '}
                    {STATUS_LABELS[detailRequest.status] ?? detailRequest.status}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Urgência:</span>{' '}
                    {URGENCY_LABELS[detailRequest.urgency]}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Tipo:</span>{' '}
                    {TYPE_LABELS[detailRequest.requestType] ?? detailRequest.requestType}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Criada em:</span>{' '}
                    {formatDateTime(detailRequest.createdAt)}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Prazo (início):</span>{' '}
                    {formatYmd(detailRequest.prazoInicio)}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Prazo (fim):</span>{' '}
                    {formatYmd(detailRequest.prazoFim)}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Contrato:</span>{' '}
                    {detailRequest.contract?.name ?? '—'}
                    {detailRequest.contract?.number ? ` (${detailRequest.contract.number})` : ''}
                  </div>
                  {(detailRequest.company || detailRequest.polo) && (
                    <div className="sm:col-span-2">
                      <span className="font-semibold text-gray-900 dark:text-gray-100">Empresa / polo:</span>{' '}
                      {[detailRequest.company, detailRequest.polo].filter(Boolean).join(' · ') || '—'}
                    </div>
                  )}
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Solicitante:</span>{' '}
                    {detailRequest.solicitanteNome}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Setor:</span>{' '}
                    {detailRequest.sectorSolicitante || '—'}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">Login:</span>{' '}
                    {detailRequest.solicitanteEmail || '—'}
                  </div>
                </div>

                {detailModalRows.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Informações
                    </h3>
                    <div className="max-h-[240px] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <dl className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
                        {detailModalRows.map((row) => (
                          <div key={row.key} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-4">
                            <dt className="font-medium text-gray-700 dark:text-gray-300">{row.label}</dt>
                            <dd className="whitespace-pre-wrap break-words text-gray-600 dark:text-gray-400">
                              {row.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Decisão</h3>
                  <div className="space-y-3">
                    <Input
                      value={managerComment[detailRequest.id] || ''}
                      onChange={(e) =>
                        setManagerComment((p) => ({ ...p, [detailRequest.id]: e.target.value }))
                      }
                      placeholder="Comentário (opcional)"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button type="button" variant="outline" onClick={() => setDetailRequest(null)}>
                        Fechar
                      </Button>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="error"
                          onClick={() => rejectMutation.mutate({ id: detailRequest.id })}
                          disabled={
                            approveMutation.isPending ||
                            rejectMutation.isPending ||
                            detailRequest.status !== 'WAITING_MANAGER'
                          }
                        >
                          {rejectMutation.isPending ? 'Rejeitando…' : 'Rejeitar'}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => approveMutation.mutate({ id: detailRequest.id })}
                          disabled={
                            approveMutation.isPending ||
                            rejectMutation.isPending ||
                            detailRequest.status !== 'WAITING_MANAGER'
                          }
                        >
                          {approveMutation.isPending ? 'Aprovando…' : 'Aprovar'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Modal>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
