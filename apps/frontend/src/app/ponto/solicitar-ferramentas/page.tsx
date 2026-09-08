'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Search, Wrench, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Loading } from '@/components/ui/Loading';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  cadastroListClasses,
  getListTableRowClassName,
  RowActionMenuCell,
  RowActionMenuPortal,
} from '@/components/ui/RowActionMenu';
import { ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';
import { POLO_OPTIONS } from '@/components/suprimentos/materialDeliveryLabels';
import { useCostCenters } from '@/hooks/useCostCenters';
import { useLogout } from '@/hooks/useLogout';
import { authService } from '@/lib/auth';
import api from '@/lib/api';
import {
  formatToolRentalDemand,
  formatToolRentalLogistics,
  formatToolRentalPriority,
  formatToolRentalStatus,
  TOOL_RENTAL_DEMAND_OPTIONS,
  TOOL_RENTAL_LOGISTICS_OPTIONS,
  TOOL_RENTAL_PRIORITY_OPTIONS,
  toolRentalStatusBadgeClass,
  type ToolRentalDemandType,
  type ToolRentalLogisticsMode,
  type ToolRentalPriority,
  type ToolRentalRequestStatus,
} from '@/lib/toolRentalLabels';
import { buildToolRentalTimeline, type ToolRentalTimelineEvent } from '@/lib/toolRentalTimeline';
import {
  DpRequestHistoryModalTabs,
  DpRequestHistoryTimeline,
  type DpRequestHistoryModalTab,
} from '@/lib/dpRequestHistoryModal';

type ToolRentalRequest = {
  id: string;
  code: string;
  polo: string;
  contrato: string;
  obra: string;
  titulo: string;
  equipamento: string;
  demandType: ToolRentalDemandType;
  priority: ToolRentalPriority;
  logisticsMode?: ToolRentalLogisticsMode;
  status: ToolRentalRequestStatus;
  periodoInicio: string;
  periodoFim: string;
  linkSugestao?: string | null;
  supplierName?: string | null;
  createdAt?: string;
  updatedAt?: string;
  suppliesApprovedAt?: string | null;
  suppliesApprovalComment?: string | null;
  suppliesRejectionReason?: string | null;
  assignedUser?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  suppliesApprovedBy?: { id: string; name: string } | null;
  events?: ToolRentalTimelineEvent[];
};

type FormState = {
  polo: string;
  contrato: string;
  obra: string;
  titulo: string;
  supplierId: string;
  priority: ToolRentalPriority;
  logisticsMode: ToolRentalLogisticsMode;
  demandType: ToolRentalDemandType;
  equipamento: string;
  periodoInicio: string;
  periodoFim: string;
  linkSugestao: string;
};

const EMPTY_FORM = (): FormState => ({
  polo: 'DF',
  contrato: '',
  obra: '',
  titulo: '',
  supplierId: '',
  priority: 'NORMAL',
  logisticsMode: 'RETIRADA_LOGISTICA',
  demandType: 'NOVA_LOCACAO',
  equipamento: '',
  periodoInicio: '',
  periodoFim: '',
  linkSugestao: '',
});

const labelCls =
  'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300';
const requiredMark = <span className="text-red-600"> *</span>;
const fieldCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500';

function formatDateOnly(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'dd/MM/yyyy', { locale: ptBR });
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

function SolicitarLocacoesFerramentasPage() {
  const queryClient = useQueryClient();
  const handleLogout = useLogout();
  const user = authService.getUser();
  const { costCentersList, isLoading: loadingCostCenters } = useCostCenters();

  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [selected, setSelected] = useState<ToolRentalRequest | null>(null);
  const [detailTab, setDetailTab] = useState<DpRequestHistoryModalTab>('detalhes');

  const { data: listData, isLoading } = useQuery({
    queryKey: ['tool-rental-requests', searchTerm, page],
    queryFn: async () => {
      const res = await api.get('/tool-rental-requests', {
        params: { search: searchTerm || undefined, page, limit: 20 },
      });
      return res.data;
    },
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['tool-rental-suppliers'],
    queryFn: async () => {
      const res = await api.get('/suppliers', {
        params: { page: 1, limit: 500, isActive: 'true' },
      });
      return res.data?.data ?? [];
    },
    enabled: showForm,
  });

  const contractOptions = useMemo(
    () =>
      (costCentersList || [])
        .filter(Boolean)
        .map((label: string) => ({ value: label, label, searchText: label })),
    [costCentersList]
  );

  const supplierOptions = useMemo(() => {
    const rows = Array.isArray(suppliersData) ? suppliersData : [];
    return rows.map(
      (s: { id: string; name: string; tradeName?: string | null; code?: string }) => ({
        value: s.id,
        label: s.tradeName || s.name,
        searchText: `${s.tradeName || ''} ${s.name} ${s.code || ''}`,
      })
    );
  }, [suppliersData]);

  const createMutation = useMutation({
    mutationFn: async (payload: FormState) => {
      await api.post('/tool-rental-requests', {
        polo: payload.polo,
        contrato: payload.contrato,
        obra: payload.obra,
        titulo: payload.titulo,
        supplierId: payload.supplierId || null,
        priority: payload.priority,
        logisticsMode: payload.logisticsMode,
        demandType: payload.demandType,
        equipamento: payload.equipamento,
        periodoInicio: payload.periodoInicio,
        periodoFim: payload.periodoFim,
        linkSugestao: payload.linkSugestao || null,
      });
    },
    onSuccess: () => {
      toast.success('Solicitação aberta — após a SC, o Suprimentos dá continuidade');
      setShowForm(false);
      setForm(EMPTY_FORM());
      queryClient.invalidateQueries({ queryKey: ['tool-rental-requests'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Não foi possível criar a solicitação');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.put(`/tool-rental-requests/${id}/cancel`);
    },
    onSuccess: () => {
      toast.success('Solicitação cancelada');
      queryClient.invalidateQueries({ queryKey: ['tool-rental-requests'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Não foi possível cancelar');
    },
  });

  const rows: ToolRentalRequest[] = listData?.data ?? [];
  const total = listData?.pagination?.total ?? 0;
  const listRange = getCadastroListRange(page, 20, total);

  const {
    rowActionMenu,
    rowForActionMenu,
    isRowMenuOpen,
    toggleRowActionMenu,
    closeRowActionMenu,
  } = useRowActionMenu(rows);

  const openForm = () => {
    setForm(EMPTY_FORM());
    setShowForm(true);
  };

  const submitForm = () => {
    if (!form.polo) return toast.error('Informe o polo');
    if (!form.contrato.trim()) return toast.error('Informe o contrato');
    if (!form.obra.trim()) return toast.error('Informe a obra');
    if (!form.titulo.trim()) return toast.error('Informe o título');
    if (!form.priority) return toast.error('Informe a prioridade');
    if (!form.logisticsMode) return toast.error('Informe a modalidade logística');
    if (!form.demandType) return toast.error('Informe o tipo de demanda');
    if (!form.equipamento.trim()) return toast.error('Informe o equipamento');
    if (!form.periodoInicio) return toast.error('Informe a data de início');
    if (!form.periodoFim) return toast.error('Informe a data de fim');
    createMutation.mutate(form);
  };

  if (!user) {
    return <Loading />;
  }

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
            Solicitação de Ferramentas
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
            Solicite locação, renovação, devolução ou compra de equipamentos
          </p>
        </div>

        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <div className={cadastroListClasses.cardHeaderIconRow}>
                <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                  <Wrench className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                    Minhas solicitações
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Acompanhe o status das solicitações enviadas ao Suprimentos
                  </p>
                </div>
              </div>
              <div className={cadastroListClasses.cardToolbar}>
                <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setPage(1);
                    }}
                    placeholder="Buscar..."
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={openForm}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  <Plus className="h-4 w-4" />
                  Nova solicitação
                </button>
              </div>
            </div>
          </CardHeader>
        <CardContent className={cadastroListClasses.cardContent}>
          <CadastroListSummary
            startItem={listRange.startItem}
            endItem={listRange.endItem}
            total={total}
            itemLabel="solicitação"
            itemLabelPlural="solicitações"
            currentPage={page}
            totalPages={listRange.totalPages}
          />
          {isLoading ? (
            <CadastroListLoading message="Carregando solicitações..." />
          ) : rows.length === 0 ? (
            <CadastroListEmpty
              icon={Wrench}
              title="Nenhuma solicitação encontrada"
              hint="Clique em Nova solicitação para começar."
            />
          ) : (
            <div className="table-scroll">
              <table className={cadastroListClasses.table}>
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className={cadastroListClasses.th}>ID</th>
                    <th className={cadastroListClasses.th}>Título</th>
                    <th className={cadastroListClasses.thCenter}>Tipo</th>
                    <th className={cadastroListClasses.thCenter}>Período</th>
                    <th className={cadastroListClasses.thCenter}>Status</th>
                    <th className={cadastroListClasses.thRight}>Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                  {rows.map((row, index) => (
                    <tr
                      key={row.id}
                      className={getListTableRowClassName(true)}
                      onClick={() => {
                        setDetailTab('detalhes');
                        setSelected(row);
                      }}
                    >
                      <td className={cadastroListClasses.tdMono}>
                        <ListRowNavigableLabel className="font-mono font-medium">
                          {formatCadastroListId(row.code, listRange.startItem + index)}
                        </ListRowNavigableLabel>
                      </td>
                      <td className={cadastroListClasses.tdTruncate}>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900 dark:text-gray-100">
                            {row.titulo}
                          </p>
                          <p className="truncate text-xs text-gray-500">{row.equipamento}</p>
                        </div>
                      </td>
                      <td className={cadastroListClasses.tdCenter}>
                        {formatToolRentalDemand(row.demandType)}
                      </td>
                      <td className={cadastroListClasses.tdCenter}>
                        {formatDateOnly(row.periodoInicio)} – {formatDateOnly(row.periodoFim)}
                      </td>
                      <td className={cadastroListClasses.tdCenter}>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${toolRentalStatusBadgeClass(row.status)}`}
                        >
                          {formatToolRentalStatus(row.status)}
                        </span>
                      </td>
                      <RowActionMenuCell
                        isOpen={isRowMenuOpen(row.id)}
                        onToggle={(e) => toggleRowActionMenu(row.id, e.currentTarget)}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {rowActionMenu && rowForActionMenu ? (
            <RowActionMenuPortal
              menu={rowActionMenu}
              onClose={closeRowActionMenu}
              onEdit={() => {}}
              hideDefaultActions
              extraItems={[
                {
                  label: 'Cancelar',
                  tone: 'danger',
                  disabled: rowForActionMenu.status !== 'OPEN',
                  disabledTitle: 'Somente solicitações abertas podem ser canceladas',
                  icon: <XCircle className="h-4 w-4 shrink-0" />,
                  onClick: () => {
                    if (confirm('Cancelar esta solicitação?')) {
                      cancelMutation.mutate(rowForActionMenu.id);
                    }
                  },
                },
              ]}
            />
          ) : null}
          <ListPagination
            currentPage={page}
            totalPages={listRange.totalPages}
            onPageChange={setPage}
          />
        </CardContent>
      </Card>

      <Modal
        isOpen={!!selected}
        onClose={() => {
          setSelected(null);
          setDetailTab('detalhes');
        }}
        title={selected ? `Solicitação #${selected.code}` : 'Solicitação'}
        size="lg"
      >
        {selected ? (
          <div className="space-y-5 text-sm">
            <DpRequestHistoryModalTabs activeTab={detailTab} onTabChange={setDetailTab} />

            {detailTab === 'detalhes' ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Status</p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${toolRentalStatusBadgeClass(selected.status)}`}
                    >
                      {formatToolRentalStatus(selected.status)}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Tipo</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                      {formatToolRentalDemand(selected.demandType)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Prioridade</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                      {formatToolRentalPriority(selected.priority)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Modalidade</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                      {selected.logisticsMode
                        ? formatToolRentalLogistics(selected.logisticsMode)
                        : '—'}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold uppercase text-gray-500">Título</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.titulo}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs font-semibold uppercase text-gray-500">Equipamento</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                      {selected.equipamento}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Período</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">
                      {formatDateOnly(selected.periodoInicio)} – {formatDateOnly(selected.periodoFim)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Polo</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.polo}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Contrato</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.contrato}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase text-gray-500">Obra</p>
                    <p className="mt-1 font-medium text-gray-900 dark:text-gray-100">{selected.obra}</p>
                  </div>
                </div>
                {selected.status === 'OPEN' ? (
                  <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm('Cancelar esta solicitação?')) {
                          cancelMutation.mutate(selected.id);
                          setSelected(null);
                          setDetailTab('detalhes');
                        }
                      }}
                      className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"
                    >
                      Cancelar solicitação
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <DpRequestHistoryTimeline
                steps={buildToolRentalTimeline(selected)}
                formatDateTime={formatDateTime}
              />
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        isOpen={showForm}
        onClose={() => !createMutation.isPending && setShowForm(false)}
        title="Solicitação de ferramentas"
        size="xl"
      >
        <div className="space-y-5">
          <div>
            <label className={labelCls}>Tipo de demanda{requiredMark}</label>
            <StringSingleSelectDropdown
              value={form.demandType}
              onChange={(demandType) =>
                setForm((f) => ({ ...f, demandType: demandType as ToolRentalDemandType }))
              }
              options={TOOL_RENTAL_DEMAND_OPTIONS.map((opt) => ({
                value: opt.value,
                label: opt.label,
                searchText: opt.label,
              }))}
              allowEmpty={false}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Modalidade logística{requiredMark}</label>
              <StringSingleSelectDropdown
                value={form.logisticsMode}
                onChange={(logisticsMode) =>
                  setForm((f) => ({
                    ...f,
                    logisticsMode: logisticsMode as ToolRentalLogisticsMode,
                  }))
                }
                options={TOOL_RENTAL_LOGISTICS_OPTIONS}
                allowEmpty={false}
              />
            </div>
            <div>
              <label className={labelCls}>Prioridade{requiredMark}</label>
              <StringSingleSelectDropdown
                value={form.priority}
                onChange={(priority) =>
                  setForm((f) => ({ ...f, priority: priority as ToolRentalPriority }))
                }
                options={TOOL_RENTAL_PRIORITY_OPTIONS}
                allowEmpty={false}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Polo{requiredMark}</label>
            <div className="flex gap-2">
              {POLO_OPTIONS.map((opt) => (
                <ButtonSeg
                  key={opt.value}
                  active={form.polo === opt.value}
                  onClick={() => setForm((f) => ({ ...f, polo: opt.value }))}
                  label={opt.label}
                />
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}>Título{requiredMark}</label>
            <input
              className={fieldCls}
              value={form.titulo}
              onChange={(e) => setForm((f) => ({ ...f, titulo: e.target.value }))}
              placeholder={
                form.demandType === 'COMPRA'
                  ? 'Ex.: Compra de furadeira industrial'
                  : 'Ex.: Locação de andaime tubular'
              }
            />
          </div>

          <div>
            <label className={labelCls}>Equipamento{requiredMark}</label>
            <input
              className={fieldCls}
              value={form.equipamento}
              onChange={(e) => setForm((f) => ({ ...f, equipamento: e.target.value }))}
              placeholder="Descreva o equipamento"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>
                {form.demandType === 'COMPRA' ? 'Necessário a partir de' : 'Data de início'}
                {requiredMark}
              </label>
              <DatePickerField
                value={form.periodoInicio}
                onChange={(periodoInicio) => setForm((f) => ({ ...f, periodoInicio }))}
                placeholder="dd/mm/aaaa"
                noFocusRing
              />
            </div>
            <div>
              <label className={labelCls}>
                {form.demandType === 'COMPRA' ? 'Necessário até' : 'Data de fim'}
                {requiredMark}
              </label>
              <DatePickerField
                value={form.periodoFim}
                onChange={(periodoFim) => setForm((f) => ({ ...f, periodoFim }))}
                placeholder="dd/mm/aaaa"
                noFocusRing
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Contrato{requiredMark}</label>
              <SingleSelectSearchDropdown
                value={form.contrato}
                onChange={(contrato) => setForm((f) => ({ ...f, contrato }))}
                options={contractOptions}
                disabled={loadingCostCenters}
                placeholder={loadingCostCenters ? 'Carregando…' : 'Selecionar contrato…'}
                searchPlaceholder="Pesquisar contrato…"
                emptyOptionsMessage="Nenhum contrato disponível."
                noFocusRing
              />
            </div>
            <div>
              <label className={labelCls}>Obra{requiredMark}</label>
              <input
                className={fieldCls}
                value={form.obra}
                onChange={(e) => setForm((f) => ({ ...f, obra: e.target.value }))}
                placeholder="Informe a obra"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Fornecedor</label>
            <SingleSelectSearchDropdown
              value={form.supplierId}
              onChange={(supplierId) => setForm((f) => ({ ...f, supplierId }))}
              options={supplierOptions}
              placeholder="Selecionar fornecedor (opcional)…"
              searchPlaceholder="Pesquisar fornecedor…"
              emptyOptionsMessage="Nenhum fornecedor encontrado."
              noFocusRing
            />
          </div>

          <div>
            <label className={labelCls}>Link de sugestão de equipamento</label>
            <input
              className={fieldCls}
              value={form.linkSugestao}
              onChange={(e) => setForm((f) => ({ ...f, linkSugestao: e.target.value }))}
              placeholder="http://"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={createMutation.isPending}
              onClick={submitForm}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>
      </div>
    </MainLayout>
  );
}

export default function Page() {
  return (
    <ProtectedRoute route="/ponto/solicitar-ferramentas">
      <SolicitarLocacoesFerramentasPage />
    </ProtectedRoute>
  );
}
