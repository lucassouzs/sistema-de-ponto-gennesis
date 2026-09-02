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
  Eye,
  FileText,
  Filter,
  History,
  Search,
  Settings2,
  AlertCircle,
  MinusCircle,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { CadastroListEmpty, CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { cadastroListClasses, RowActionMenuCell, RowActionMenuPortal } from '@/components/ui/RowActionMenu';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { ReuniaoFormModal } from '@/components/contract/ReuniaoFormModal';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import api from '@/lib/api';
import { textMatchesSearch } from '@/lib/normalizeSearchText';
import { formatMonthLabel, getIsoMonthKey, shiftIsoMonthKey } from '@/lib/monthPeriod';
import { getListTableRowClassName } from '@/components/ui/listTableUi';

type MensalReportStatus = 'sem_formulario' | 'pendente' | 'preenchido';
type StatusFilter = 'todos' | MensalReportStatus;

interface MensalOverviewRow {
  contractId: string;
  contractName: string;
  contractNumber: string;
  costCenterCode?: string;
  formularioId?: string;
  formularioName?: string;
  monthKey: string;
  status: MensalReportStatus;
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
  MensalReportStatus,
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  sem_formulario: {
    label: 'Sem formulário',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    Icon: MinusCircle,
  },
  pendente: {
    label: 'Pendente',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
    Icon: AlertCircle,
  },
  preenchido: {
    label: 'Preenchido',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    Icon: CheckCircle2,
  },
};

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
    subtitle: 'Relatórios mensais preenchidos pela equipe de cada contrato',
    Icon: FileText,
    iconBg: 'bg-gray-100 dark:bg-gray-800',
    iconColor: 'text-gray-600 dark:text-gray-400',
  },
  preenchido: {
    title: 'Preenchidos',
    subtitle: 'Contratos com relatório mensal enviado no mês selecionado',
    Icon: CheckCircle2,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  pendente: {
    title: 'Pendentes',
    subtitle: 'Contratos aguardando preenchimento mensal da equipe do contrato',
    Icon: AlertCircle,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  sem_formulario: {
    title: 'Sem formulário',
    subtitle: 'Contratos sem formulário mensal configurado',
    Icon: MinusCircle,
    iconBg: 'bg-gray-100 dark:bg-gray-800',
    iconColor: 'text-gray-500 dark:text-gray-400',
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

export function RelatoriosContratoMensalPanel() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [monthKey, setMonthKey] = useState(getIsoMonthKey());
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [configTargetIds, setConfigTargetIds] = useState<string[]>([]);
  const [selectedFormularioId, setSelectedFormularioId] = useState('');
  const [viewContractId, setViewContractId] = useState<string | null>(null);
  const [viewEntryId, setViewEntryId] = useState<string | null>(null);

  const { data: overviewRes, isLoading: loadingOverview } = useQuery({
    queryKey: ['reunioes-mensal-overview', monthKey],
    queryFn: async () =>
      (await api.get('/reunioes/mensal/overview', { params: { monthKey } })).data,
  });

  const { data: formulariosData, isLoading: loadingFormularios } = useQuery({
    queryKey: ['formularios-templates'],
    queryFn: async () => {
      const res = await api.get('/formularios');
      return (Array.isArray(res.data?.data) ? res.data.data : []) as FormularioOption[];
    },
    enabled: configTargetIds.length > 0,
  });

  const rows: MensalOverviewRow[] = Array.isArray(overviewRes?.data) ? overviewRes.data : [];
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
    if (!searchTerm.trim()) return true;
    return (
      textMatchesSearch(row.contractName, searchTerm) ||
      textMatchesSearch(row.contractNumber, searchTerm) ||
      textMatchesSearch(row.formularioName, searchTerm) ||
      textMatchesSearch(row.costCenterCode, searchTerm)
    );
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

  const hasActiveFilter = monthKey !== getIsoMonthKey();
  const listHeader = LIST_HEADER_BY_FILTER[statusFilter];
  const ListHeaderIcon = listHeader.Icon;

  const configMutation = useMutation({
    mutationFn: async ({ ids, formularioId }: { ids: string[]; formularioId: string }) => {
      await Promise.all(
        ids.map((contractId) =>
          api.put(`/reunioes/${contractId}/mensal/config`, { formularioId }),
        ),
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reunioes-mensal-overview', monthKey] });
      setConfigTargetIds([]);
      setSelectedFormularioId('');
      toast.success('Formulário mensal atribuído ao contrato.');
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Erro ao salvar configuração.';
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

  const openViewReport = (row: MensalOverviewRow) => {
    if (!row.entryId) {
      if (row.status === 'pendente') {
        toast('Aguardando preenchimento pela equipe do contrato.', { icon: '⏳' });
      } else {
        toast.error('Nenhum relatório mensal disponível para este mês.');
      }
      return;
    }
    setViewContractId(row.contractId);
    setViewEntryId(row.entryId);
  };

  return (
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
                  {formatMonthLabel(monthKey)} · {filteredRows.length} contrato(s)
                </p>
              </div>
            </div>
            <div className={cadastroListClasses.cardToolbar}>
              <div className={cadastroListClasses.searchFilterGroup}>
                <div className={cadastroListClasses.searchFieldInGroup}>
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar contrato ou formulário..."
                    className="box-border h-full w-full rounded-lg border border-gray-300 bg-white py-0 pl-9 pr-9 text-sm font-medium leading-10 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                  {searchTerm ? (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      aria-label="Limpar busca"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
                <div className={cadastroListClasses.filterIconButtonWrap}>
                  <button
                    type="button"
                    onClick={() => setIsFiltersModalOpen(true)}
                    className={`${cadastroListClasses.filterIconButton} transition-colors ${
                      hasActiveFilter
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtros"
                    title={hasActiveFilter ? 'Filtros ativos' : 'Filtros'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilter ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className={cadastroListClasses.cardContent}>
          {loadingOverview ? (
            <CadastroListLoading message="Carregando relatórios mensais..." />
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
                      label: 'Ver relatório do mês',
                      icon: (
                        <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                      ),
                      onClick: () => openViewReport(rowForActionMenu),
                      disabled: !rowForActionMenu.entryId,
                      disabledTitle: 'Relatório ainda não preenchido',
                    },
                    {
                      label: 'Histórico mensal',
                      icon: (
                        <History className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-400" />
                      ),
                      onClick: () =>
                        router.push(
                          `/ponto/contratos/${rowForActionMenu.contractId}/acompanhamento-mensal`,
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

      <Modal
        isOpen={isFiltersModalOpen}
        onClose={() => setIsFiltersModalOpen(false)}
        title="Filtros"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Mês de referência
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white p-1 dark:border-gray-600 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => setMonthKey((current) => shiftIsoMonthKey(current, -1))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="min-w-0 flex-1 px-2 text-center text-sm font-medium text-gray-900 dark:text-gray-100">
                {formatMonthLabel(monthKey)}
              </p>
              <button
                type="button"
                onClick={() => setMonthKey((current) => shiftIsoMonthKey(current, 1))}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {hasActiveFilter ? (
              <button
                type="button"
                onClick={() => setMonthKey(getIsoMonthKey())}
                className="mt-2 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Voltar para este mês
              </button>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button type="button" variant="outline" onClick={() => setMonthKey(getIsoMonthKey())}>
              Limpar filtros
            </Button>
            <Button type="button" onClick={() => setIsFiltersModalOpen(false)}>
              Fechar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={configTargetIds.length > 0}
        onClose={() => {
          if (configMutation.isPending) return;
          setConfigTargetIds([]);
          setSelectedFormularioId('');
        }}
        title="Atribuir formulário mensal ao contrato"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Escolha o formulário que a equipe do contrato preencherá mensalmente. Os templates são
            criados em{' '}
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
        isOpen={!!viewContractId && !!viewEntryId}
        onClose={() => {
          setViewContractId(null);
          setViewEntryId(null);
        }}
        contractId={viewContractId || ''}
        kind="mensal"
        reuniaoId={viewEntryId}
      />
    </>
  );
}
