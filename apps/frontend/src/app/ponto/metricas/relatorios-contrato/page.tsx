'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  History,
  PenLine,
  Settings2,
  AlertCircle,
  MinusCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { CadastroListEmpty, CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses, RowActionMenuCell, RowActionMenuPortal } from '@/components/ui/RowActionMenu';
import { Modal } from '@/components/ui/Modal';
import { ReuniaoFormModal } from '@/components/contract/ReuniaoFormModal';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { RelatoriosContratoMensalPanel } from './RelatoriosContratoMensalPanel';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import api from '@/lib/api';
import {
  formatWeekLabel,
  getFortnightKey,
  isFortnightAfter,
  isFortnightBefore,
  shiftFortnightKey,
} from '@/lib/weekPeriod';
import { getListTableRowClassName } from '@/components/ui/listTableUi';

type SemanalReportStatus = 'sem_formulario' | 'pendente' | 'preenchido';
type StatusFilter = 'todos' | SemanalReportStatus;

interface SemanalOverviewRow {
  contractId: string;
  contractName: string;
  contractNumber: string;
  costCenterCode?: string;
  formularioId?: string;
  formularioName?: string;
  weekKey: string;
  status: SemanalReportStatus;
  entryId?: string;
  responsavelPreenchimento?: string;
  updatedAt?: string;
  totalRegistros: number;
}

interface FormularioOption {
  id: string;
  name: string;
  description?: string;
}

const STATUS_META: Record<
  SemanalReportStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  sem_formulario: {
    label: 'Sem formulário',
    className:
      'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    Icon: MinusCircle,
  },
  pendente: {
    label: 'Pendente',
    className:
      'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    Icon: AlertCircle,
  },
  preenchido: {
    label: 'Preenchido',
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    Icon: CheckCircle2,
  },
};

function formatDateTime(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STAT_CARDS: {
  filter: StatusFilter;
  label: string;
  countKey: 'total' | 'preenchido' | 'pendente' | 'semFormulario';
  Icon: typeof CheckCircle2;
  iconBg: string;
  iconColor: string;
}[] = [
  {
    filter: 'todos',
    label: 'Todos',
    countKey: 'total',
    Icon: FileText,
    iconBg: 'bg-gray-100 dark:bg-gray-800',
    iconColor: 'text-gray-600 dark:text-gray-400',
  },
  {
    filter: 'preenchido',
    label: 'Preenchidos',
    countKey: 'preenchido',
    Icon: CheckCircle2,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    filter: 'pendente',
    label: 'Pendentes',
    countKey: 'pendente',
    Icon: AlertCircle,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    filter: 'sem_formulario',
    label: 'Sem formulário',
    countKey: 'semFormulario',
    Icon: MinusCircle,
    iconBg: 'bg-gray-100 dark:bg-gray-800',
    iconColor: 'text-gray-500 dark:text-gray-400',
  },
];

const LIST_HEADER_BY_FILTER: Record<
  StatusFilter,
  { title: string; subtitle: string; Icon: typeof CheckCircle2; iconBg: string; iconColor: string }
> = {
  todos: {
    title: 'Todos os contratos',
    subtitle: 'Reuniões quinzenais e acompanhamento de preenchimento',
    Icon: FileText,
    iconBg: 'bg-gray-100 dark:bg-gray-800',
    iconColor: 'text-gray-600 dark:text-gray-400',
  },
  preenchido: {
    title: 'Preenchidos',
    subtitle: 'Contratos com reunião quinzenal registrada nesta quinzena',
    Icon: CheckCircle2,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  pendente: {
    title: 'Pendentes',
    subtitle: 'Contratos aguardando registro da reunião desta quinzena',
    Icon: AlertCircle,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  sem_formulario: {
    title: 'Sem formulário',
    subtitle: 'Contratos sem formulário quinzenal configurado',
    Icon: MinusCircle,
    iconBg: 'bg-gray-100 dark:bg-gray-800',
    iconColor: 'text-gray-500 dark:text-gray-400',
  },
};

type PageTab = 'semanal' | 'mensal';

export default function RelatoriosContratoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pageTab, setPageTab] = useState<PageTab>('semanal');
  const [weekKey, setWeekKey] = useState(getFortnightKey());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [configTargetIds, setConfigTargetIds] = useState<string[]>([]);
  const [selectedFormularioId, setSelectedFormularioId] = useState('');
  const [fillContractId, setFillContractId] = useState<string | null>(null);
  const [fillEntryId, setFillEntryId] = useState<string | null>(null);

  const currentWeekKey = getFortnightKey();
  const canGoNextWeek = isFortnightBefore(weekKey, currentWeekKey);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: overviewRes, isLoading: loadingOverview } = useQuery({
    queryKey: ['reunioes-semanal-overview', weekKey],
    queryFn: async () =>
      (await api.get('/reunioes/semanal/overview', { params: { weekKey } })).data,
    enabled: pageTab === 'semanal',
  });

  const { data: formulariosData, isLoading: loadingFormularios } = useQuery({
    queryKey: ['formularios-templates'],
    queryFn: async () => {
      const res = await api.get('/formularios');
      return (Array.isArray(res.data?.data) ? res.data.data : []) as FormularioOption[];
    },
    enabled: configTargetIds.length > 0,
  });

  const rows: SemanalOverviewRow[] = Array.isArray(overviewRes?.data) ? overviewRes.data : [];
  const formularios = Array.isArray(formulariosData) ? formulariosData : [];

  const stats = useMemo(() => {
    const total = rows.length;
    const semFormulario = rows.filter((r) => r.status === 'sem_formulario').length;
    const pendente = rows.filter((r) => r.status === 'pendente').length;
    const preenchido = rows.filter((r) => r.status === 'preenchido').length;
    return { total, semFormulario, pendente, preenchido };
  }, [rows]);

  const filteredRows = rows.filter((row) => {
    if (statusFilter !== 'todos' && row.status !== statusFilter) return false;
    return true;
  });

  const rowsForActionMenu = useMemo(
    () => filteredRows.map((row) => ({ ...row, id: row.contractId })),
    [filteredRows],
  );

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(rowsForActionMenu);

  const configMutation = useMutation({
    mutationFn: async ({ ids, formularioId }: { ids: string[]; formularioId: string }) => {
      await Promise.all(
        ids.map((contractId) =>
          api.put(`/reunioes/${contractId}/semanal/config`, { formularioId }),
        ),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reunioes-semanal-overview', weekKey] });
      setConfigTargetIds([]);
      setSelectedFormularioId('');
      toast.success('Formulário atribuído ao contrato.');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao salvar configuração.';
      toast.error(msg);
    },
  });

  const openPeriodMutation = useMutation({
    mutationFn: async (contractId: string) =>
      (await api.post(`/reunioes/${contractId}/semanal/periodo-atual`)).data,
    onSuccess: (res, contractId) => {
      queryClient.invalidateQueries({ queryKey: ['reunioes-semanal-overview', weekKey] });
      const entry = res.data as { id: string };
      setFillContractId(contractId);
      setFillEntryId(entry.id);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao abrir a quinzena.';
      toast.error(msg);
    },
  });

  const openConfig = (ids: string[]) => {
    setConfigTargetIds(ids);
    if (ids.length === 1) {
      const row = rows.find((r) => r.contractId === ids[0]);
      if (row?.formularioId) setSelectedFormularioId(row.formularioId);
    }
  };

  const handleFill = (row: SemanalOverviewRow) => {
    if (row.status === 'sem_formulario') {
      toast.error('Configure um formulário antes de preencher.');
      openConfig([row.contractId]);
      return;
    }
    if (row.entryId) {
      setFillContractId(row.contractId);
      setFillEntryId(row.entryId);
      return;
    }
    openPeriodMutation.mutate(row.contractId);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const listHeader = LIST_HEADER_BY_FILTER[statusFilter];
  const ListHeaderIcon = listHeader.Icon;

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/metricas/relatorios-contrato">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Relatórios de Contrato
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              {pageTab === 'semanal'
                ? 'Registre as reuniões quinzenais com a equipe de cada contrato.'
                : 'Acompanhe os relatórios mensais preenchidos pelas equipes dos contratos.'}
            </p>
            <div className="mt-4 flex justify-center">
              <SegmentedControl
                value={pageTab}
                onChange={setPageTab}
                aria-label="Tipo de relatório"
                className="h-auto [&>button]:px-5 [&>button]:py-2 [&>button]:font-medium"
                pillClassName="bg-white shadow-sm dark:bg-gray-900"
                options={[
                  { value: 'semanal', label: 'Reuniões quinzenais' },
                  { value: 'mensal', label: 'Relatórios mensais' },
                ]}
              />
            </div>
          </div>

          {pageTab === 'mensal' ? (
            <RelatoriosContratoMensalPanel />
          ) : (
            <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            {STAT_CARDS.map((card) => (
              <FilterStatCard
                key={card.filter}
                label={card.label}
                count={stats[card.countKey]}
                icon={card.Icon}
                iconBg={card.iconBg}
                iconColor={card.iconColor}
                isActive={statusFilter === card.filter}
                loading={loadingOverview}
                onClick={() =>
                  setStatusFilter((prev) => (prev === card.filter ? 'todos' : card.filter))
                }
              />
            ))}
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className={`shrink-0 rounded-lg p-2 sm:p-3 ${listHeader.iconBg}`}>
                    <ListHeaderIcon
                      className={`h-5 w-5 sm:h-6 sm:w-6 ${listHeader.iconColor}`}
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
                      {listHeader.title}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {filteredRows.length} contrato(s)
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className="box-border flex h-10 w-full shrink-0 items-center gap-0.5 rounded-lg border border-gray-300 bg-white px-1 dark:border-gray-600 dark:bg-gray-800 sm:w-auto sm:min-w-[300px]">
                    <button
                      type="button"
                      onClick={() => setWeekKey((current) => shiftFortnightKey(current, -1))}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                      aria-label="Quinzena anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <p className="flex-1 whitespace-nowrap px-1 text-center text-sm font-medium leading-none text-gray-900 dark:text-gray-100">
                      {formatWeekLabel(weekKey)}
                    </p>
                    <button
                      type="button"
                      disabled={!canGoNextWeek}
                      onClick={() =>
                        setWeekKey((current) => {
                          const next = shiftFortnightKey(current, 1);
                          return isFortnightAfter(next, currentWeekKey) ? currentWeekKey : next;
                        })
                      }
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-40 dark:text-gray-300 dark:hover:bg-gray-700"
                      aria-label="Próxima quinzena"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {loadingOverview ? (
                <CadastroListLoading message="Carregando contratos..." />
              ) : filteredRows.length === 0 ? (
                <CadastroListEmpty
                  icon={ListHeaderIcon}
                  title="Nenhum contrato encontrado para os filtros atuais."
                />
              ) : (
                <div className={cadastroListClasses.tableScroll}>
                  <table className="w-full min-w-[960px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700">
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Contrato
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                          Formulário
                        </th>
                        <th className={`${cadastroListClasses.thCenter} px-3 py-2 font-semibold`}>
                          Status
                        </th>
                        <th className={`${cadastroListClasses.thCenter} px-3 py-2 font-semibold`}>
                          Responsável
                        </th>
                        <th className={`${cadastroListClasses.thCenter} px-3 py-2 font-semibold`}>
                          Atualizado
                        </th>
                        <th className={`${cadastroListClasses.thCenter} w-14`}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => {
                        const meta = STATUS_META[row.status];
                        const StatusIcon = meta.Icon;
                        return (
                          <tr
                            key={row.contractId}
                            className={`border-b border-gray-100 dark:border-gray-800/80 ${getListTableRowClassName(false)}`}
                          >
                            <td className="px-3 py-3">
                              <div className="font-medium text-gray-900 dark:text-gray-100">
                                {row.contractName}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-gray-700 dark:text-gray-300">
                              {row.formularioName || (
                                <span className="text-gray-400">Não configurado</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.className}`}
                              >
                                <StatusIcon className="h-3.5 w-3.5" />
                                {meta.label}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-center text-gray-600 dark:text-gray-300">
                              {row.responsavelPreenchimento?.trim() || '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-center text-gray-600 dark:text-gray-300">
                              {formatDateTime(row.updatedAt)}
                            </td>
                            <RowActionMenuCell
                              align="center"
                              isOpen={isRowMenuOpen(row.contractId)}
                              onToggle={(e) => toggleRowActionMenu(row.contractId, e.currentTarget)}
                            />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {rowActionMenu && rowForActionMenu ? (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      hideDefaultActions
                      extraItems={[
                        {
                          label: 'Configurar formulário',
                          icon: (
                            <Settings2 className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-400" />
                          ),
                          onClick: () => openConfig([rowForActionMenu.contractId]),
                        },
                        {
                          label: rowForActionMenu.entryId
                            ? 'Continuar reunião da quinzena'
                            : 'Registrar reunião da quinzena',
                          icon: (
                            <PenLine className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                          ),
                          onClick: () => handleFill(rowForActionMenu),
                          disabled: openPeriodMutation.isPending,
                          disabledTitle: 'Abrindo período...',
                        },
                        {
                          label: 'Histórico',
                          icon: (
                            <History className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-400" />
                          ),
                          onClick: () =>
                            router.push(
                              `/ponto/metricas/relatorios-contrato/${rowForActionMenu.contractId}`,
                            ),
                        },
                        {
                          label: 'Abrir contrato',
                          icon: (
                            <ExternalLink className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-400" />
                          ),
                          onClick: () =>
                            router.push(`/ponto/contratos/${rowForActionMenu.contractId}`),
                        },
                      ]}
                    />
                  ) : null}
                </div>
              )}
            </CardContent>
          </Card>
            </>
          )}
        </div>

        <Modal
          isOpen={pageTab === 'semanal' && configTargetIds.length > 0}
          onClose={() => {
            if (configMutation.isPending) return;
            setConfigTargetIds([]);
            setSelectedFormularioId('');
          }}
          title="Atribuir formulário ao contrato"
          size="md"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Escolha o formulário quinzenal. Os templates são criados em{' '}
              <Link href="/ponto/formularios" className="font-medium text-red-600 hover:underline">
                Cadastros → Formulários
              </Link>
              .
            </p>
            {loadingFormularios ? (
              <Loading message="Carregando formulários..." size="md" />
            ) : formularios.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center dark:border-gray-600">
                <FileText className="mx-auto mb-2 h-8 w-8 text-gray-400" />
                <p className="text-sm text-gray-600 dark:text-gray-400">Nenhum formulário cadastrado.</p>
              </div>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {formularios.map((f) => {
                  const active = selectedFormularioId === f.id;
                  return (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedFormularioId(f.id)}
                        className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                          active
                            ? 'border-red-500 bg-red-50 dark:border-red-500 dark:bg-red-950/40'
                            : 'border-gray-200 bg-white hover:border-gray-300 dark:border-gray-600 dark:bg-gray-800'
                        }`}
                      >
                        <span className="block text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {f.name}
                        </span>
                        {f.description ? (
                          <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                            {f.description}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <button
                type="button"
                onClick={() => {
                  setConfigTargetIds([]);
                  setSelectedFormularioId('');
                }}
                disabled={configMutation.isPending}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!selectedFormularioId || configMutation.isPending || formularios.length === 0}
                onClick={() =>
                  configMutation.mutate({
                    ids: configTargetIds,
                    formularioId: selectedFormularioId,
                  })
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {configMutation.isPending ? 'Salvando...' : 'Salvar atribuição'}
              </button>
            </div>
          </div>
        </Modal>

        <ReuniaoFormModal
          isOpen={pageTab === 'semanal' && !!fillContractId && !!fillEntryId}
          onClose={() => {
            setFillContractId(null);
            setFillEntryId(null);
            queryClient.invalidateQueries({ queryKey: ['reunioes-semanal-overview', weekKey] });
          }}
          contractId={fillContractId || ''}
          kind="semanal"
          reuniaoId={fillEntryId}
        />
      </MainLayout>
    </ProtectedRoute>
  );
}
