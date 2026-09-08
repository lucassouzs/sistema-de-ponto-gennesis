'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, FileSpreadsheet, Filter, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatOsSePastaOrDash } from '@/lib/formatOsSePasta';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { CadastroListSummary, getCadastroListRange } from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { listTableRowClasses } from '@/components/ui/listTableUi';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import {
  exportHistoricoOsPdf,
  exportPleitosOsToXlsx,
  computeHistoricoOsTotals,
  getOsStatus,
  getOsStatusFaturamento,
  getOsStatusFaturamentoPct,
  getPleitoCreationMonth,
  getPleitoCreationYear,
  getPleitoOrcamentoValor,
  osStatusBadgeClass,
  type BillingForOsCheck,
  type PleitoOsExportRow,
} from '@/lib/pleitoOsExport';

const LIST_DISPLAY_LIMIT = 10;

const LIST_SEARCH_INPUT_CLASS =
  'h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const TOOLBAR_BTN =
  'inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700';

const MESES_OPCOES = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function toggleInSet<T>(set: Set<T>, value: T, checked: boolean): Set<T> {
  const next = new Set(set);
  if (checked) next.add(value);
  else next.delete(value);
  return next;
}

function CheckboxFilterGroup<T extends string | number>({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: { value: T; label: string }[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</label>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            onClick={() => onChange(new Set(options.map((o) => o.value)))}
          >
            Marcar todos
          </button>
          <button
            type="button"
            className="text-xs text-gray-500 hover:underline dark:text-gray-400"
            onClick={() => onChange(new Set())}
          >
            Limpar
          </button>
        </div>
      </div>
      <div className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700">
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-gray-500 dark:text-gray-400">Sem opções</p>
        ) : (
          options.map((opt) => (
            <label
              key={String(opt.value)}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <input
                type="checkbox"
                checked={selected.has(opt.value)}
                onChange={(e) => onChange(toggleInSet(selected, opt.value, e.target.checked))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="truncate text-gray-800 dark:text-gray-200">{opt.label}</span>
            </label>
          ))
        )}
      </div>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        {selected.size === 0 ? 'Nenhum marcado = todos' : `${selected.size} selecionado(s)`}
      </p>
    </div>
  );
}

type ContractHistoricoOsPanelProps = {
  contractId: string;
};

export function ContractHistoricoOsPanel({ contractId }: ContractHistoricoOsPanelProps) {
  const [search, setSearch] = useState('');
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set());
  const [selectedOsIds, setSelectedOsIds] = useState<Set<string>>(new Set());
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [listPage, setListPage] = useState(1);

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}`);
      return res.data;
    },
    enabled: !!contractId,
  });

  const { data: pleitosData, isLoading: loadingPleitos } = useQuery({
    queryKey: ['contract-pleitos', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/pleitos`);
      return res.data;
    },
    enabled: !!contractId,
  });

  const { data: billingsData, isLoading: loadingBillings } = useQuery({
    queryKey: ['contract-billings', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/billings`);
      return res.data;
    },
    enabled: !!contractId,
  });

  const billingsForOs = useMemo(() => {
    const rows = (billingsData as { data?: BillingForOsCheck[] } | undefined)?.data || [];
    return rows as BillingForOsCheck[];
  }, [billingsData]);

  const allOs = useMemo(() => {
    const raw =
      (Array.isArray(pleitosData)
        ? pleitosData
        : (pleitosData as { data?: PleitoOsExportRow[] })?.data) || [];
    return [...raw].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [pleitosData]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    allOs.forEach((p) => {
      const y = getPleitoCreationYear(p);
      if (y) years.add(y);
    });
    return Array.from(years)
      .sort((a, b) => b - a)
      .map((y) => ({ value: y, label: String(y) }));
  }, [allOs]);

  const monthOptions = useMemo(() => {
    const months = new Set<number>();
    allOs.forEach((p) => {
      const m = getPleitoCreationMonth(p);
      if (m) months.add(m);
    });
    return MESES_OPCOES.filter((m) => months.has(m.value));
  }, [allOs]);

  const osOptions = useMemo(
    () =>
      allOs.map((p) => ({
        value: p.id,
        label: formatOsSePastaOrDash(p.divSe, p.folderNumber),
      })),
    [allOs]
  );

  const filteredOs = useMemo(() => {
    return allOs.filter((p) => {
      if (selectedYears.size > 0) {
        const y = getPleitoCreationYear(p);
        if (y == null || !selectedYears.has(y)) return false;
      }
      if (selectedMonths.size > 0) {
        const m = getPleitoCreationMonth(p);
        if (m == null || !selectedMonths.has(m)) return false;
      }
      if (selectedOsIds.size > 0 && !selectedOsIds.has(p.id)) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const os = formatOsSePastaOrDash(p.divSe, p.folderNumber).toLowerCase();
      const desc = (p.serviceDescription || '').toLowerCase();
      const status = getOsStatus(p, billingsForOs, allOs).toLowerCase();
      const statusFat = getOsStatusFaturamento(p, billingsForOs).toLowerCase();
      return os.includes(q) || desc.includes(q) || status.includes(q) || statusFat.includes(q);
    });
  }, [allOs, selectedYears, selectedMonths, selectedOsIds, search, billingsForOs]);

  useEffect(() => {
    setListPage(1);
  }, [search, selectedYears, selectedMonths, selectedOsIds]);

  const listRange = useMemo(
    () => getCadastroListRange(listPage, LIST_DISPLAY_LIMIT, filteredOs.length),
    [listPage, filteredOs.length]
  );

  const displayedOs = useMemo(() => {
    const start = (listPage - 1) * LIST_DISPLAY_LIMIT;
    return filteredOs.slice(start, start + LIST_DISPLAY_LIMIT);
  }, [filteredOs, listPage]);

  const totals = useMemo(
    () => computeHistoricoOsTotals(filteredOs, billingsForOs),
    [filteredOs, billingsForOs]
  );

  const contract = (contractData as { data?: { name: string; number: string } } | undefined)?.data;

  const hasActiveFilter =
    selectedYears.size > 0 || selectedMonths.size > 0 || selectedOsIds.size > 0;

  const clearFilters = () => {
    setSelectedYears(new Set());
    setSelectedMonths(new Set());
    setSelectedOsIds(new Set());
  };

  const handleExportExcel = () => {
    if (filteredOs.length === 0) {
      toast.error('Não há ordens de serviço para exportar.');
      return;
    }
    try {
      const contractSlug = contract?.number?.replace(/[^\w-]+/g, '_') || contractId.slice(0, 8);
      exportPleitosOsToXlsx(filteredOs, billingsForOs, `historico-os-${contractSlug}`);
      toast.success(`${filteredOs.length} ordem(ns) exportada(s) para Excel.`);
    } catch {
      toast.error('Erro ao exportar para Excel.');
    }
  };

  const handleExportPdf = async () => {
    if (allOs.length === 0) {
      toast.error('Não há ordens de serviço para exportar.');
      return;
    }
    setExportingPdf(true);
    try {
      const contractSlug = contract?.number?.replace(/[^\w-]+/g, '_') || contractId.slice(0, 8);
      await exportHistoricoOsPdf(allOs, billingsForOs, {
        contractName: contract?.name,
        contractNumber: contract?.number,
        filenamePrefix: `historico-os-${contractSlug}`,
      });
      toast.success(`PDF gerado com ${allOs.length} ordem(ns) de serviço.`);
    } catch {
      toast.error('Erro ao gerar PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  if (loadingContract || loadingPleitos || loadingBillings) {
    return <CadastroListLoading message="Carregando histórico..." />;
  }

  const countLabel =
    filteredOs.length === 1 ? '1 ordem de serviço' : `${filteredOs.length} ordens de serviço`;

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {contract ? (
              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                {contract.number} – {contract.name}
              </p>
            ) : null}
            <p className="text-sm text-gray-500 dark:text-gray-400">{countLabel}</p>
          </div>
          {allOs.length > 0 ? (
            <div className={cadastroListClasses.cardToolbar}>
              <div className="relative min-w-[220px] flex-1 sm:w-[280px] sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar OS, descrição, situação..."
                  className={LIST_SEARCH_INPUT_CLASS}
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setShowFilterModal(true)}
                className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                  hasActiveFilter
                    ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label="Abrir filtro"
                title={hasActiveFilter ? 'Filtro (ativo)' : 'Filtro'}
              >
                <Filter className="h-4 w-4" />
                {hasActiveFilter ? (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white dark:ring-gray-900" />
                ) : null}
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                disabled={filteredOs.length === 0}
                className={TOOLBAR_BTN}
                title="Exportar Excel"
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                Excel
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={allOs.length === 0 || exportingPdf}
                className={TOOLBAR_BTN}
                title="Exportar PDF"
              >
                <FileDown className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                {exportingPdf ? 'PDF…' : 'PDF'}
              </button>
            </div>
          ) : null}
        </div>

        {filteredOs.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="flex items-baseline justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/40 sm:flex-col sm:items-stretch sm:justify-start sm:gap-0.5">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Total orçado
              </span>
              <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {formatCurrency(totals.totalOrcado)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/40 sm:flex-col sm:items-stretch sm:justify-start sm:gap-0.5">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Total pleiteado
              </span>
              <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {formatCurrency(totals.totalPleiteado)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/40 sm:flex-col sm:items-stretch sm:justify-start sm:gap-0.5">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Total faturado
              </span>
              <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                {formatCurrency(totals.totalFaturado)}
              </span>
            </div>
          </div>
        ) : null}

        {allOs.length === 0 ? (
          <div className="py-10 text-center text-gray-500 dark:text-gray-400">
            Nenhuma ordem de serviço cadastrada.
          </div>
        ) : filteredOs.length === 0 ? (
          <div className="py-10 text-center text-gray-500 dark:text-gray-400">
            Nenhuma OS encontrada com os filtros selecionados.
          </div>
        ) : (
          <>
            <CadastroListSummary
              startItem={listRange.startItem}
              endItem={listRange.endItem}
              total={filteredOs.length}
              itemLabel="ordem de serviço"
              itemLabelPlural="ordens de serviço"
              currentPage={listPage}
              totalPages={listRange.totalPages}
            />
            <div className="table-scroll">
              <table className="w-full min-w-[960px] text-sm" data-cc-skip-column-customizer="1">
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className={`${cadastroListClasses.th} whitespace-nowrap align-middle`}>OS / SE</th>
                    <th className={`${cadastroListClasses.th} align-middle`}>Descrição</th>
                    <th className={`${cadastroListClasses.thNumeric} align-middle`}>Orçamento</th>
                    <th className={`${cadastroListClasses.thNumeric} whitespace-nowrap align-middle`}>
                      Valor pleiteado
                    </th>
                    <th className={`${cadastroListClasses.thCenter} whitespace-nowrap align-middle`}>
                      Fat. (%)
                    </th>
                    <th className={`${cadastroListClasses.th} whitespace-nowrap align-middle`}>
                      Preenchimento
                    </th>
                    <th className={`${cadastroListClasses.thCenter} whitespace-nowrap align-middle`}>
                      Status Pleito
                    </th>
                    <th className={`${cadastroListClasses.thCenter} whitespace-nowrap align-middle`}>
                      Status Faturamento
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                  {displayedOs.map((p) => {
                    const osStatus = getOsStatus(p, billingsForOs, allOs);
                    const osStatusFat = getOsStatusFaturamento(p, billingsForOs);
                    const valorPleiteado = p.billingRequest ? Number(p.billingRequest) : 0;
                    const statusFatPct = getOsStatusFaturamentoPct(p, billingsForOs);
                    const orcamentoNum = getPleitoOrcamentoValor(p);
                    return (
                      <tr key={p.id} className={listTableRowClasses.tr}>
                        <td className={`${cadastroListClasses.tdMono} align-middle whitespace-nowrap`}>
                          {formatOsSePastaOrDash(p.divSe, p.folderNumber)}
                        </td>
                        <td
                          className={`${cadastroListClasses.tdTruncate} align-middle`}
                          title={p.serviceDescription || ''}
                        >
                          <span className="block truncate">{p.serviceDescription || '—'}</span>
                        </td>
                        <td
                          className={`${cadastroListClasses.tdNumeric} align-middle text-gray-900 dark:text-gray-100`}
                        >
                          {orcamentoNum > 0 ? formatCurrency(orcamentoNum) : p.budget || '—'}
                        </td>
                        <td
                          className={`${cadastroListClasses.tdNumeric} align-middle text-gray-900 dark:text-gray-100`}
                        >
                          {formatCurrency(valorPleiteado)}
                        </td>
                        <td
                          className={`${cadastroListClasses.tdCenter} align-middle text-gray-900 dark:text-gray-100`}
                        >
                          {statusFatPct != null ? `${statusFatPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className={`${cadastroListClasses.tdMuted} align-middle whitespace-nowrap`}>
                          {formatDateTimeBr(p.createdAt, '—')}
                        </td>
                        <td className={`${cadastroListClasses.tdCenter} align-middle whitespace-nowrap`}>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${osStatusBadgeClass(osStatus)}`}
                          >
                            {osStatus}
                          </span>
                        </td>
                        <td className={`${cadastroListClasses.tdCenter} align-middle whitespace-nowrap`}>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${osStatusBadgeClass(osStatusFat)}`}
                          >
                            {osStatusFat}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ListPagination
              currentPage={listPage}
              totalPages={listRange.totalPages}
              onPageChange={setListPage}
            />
          </>
        )}
      </div>

      <Modal
        isOpen={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        title="Filtros — Histórico de OS"
        size="md"
      >
        <div className="space-y-4">
          <CheckboxFilterGroup
            title="Ano de criação"
            options={yearOptions}
            selected={selectedYears}
            onChange={setSelectedYears}
          />
          <CheckboxFilterGroup
            title="Mês de criação"
            options={monthOptions}
            selected={selectedMonths}
            onChange={setSelectedMonths}
          />
          <CheckboxFilterGroup
            title="OS / SE"
            options={osOptions}
            selected={selectedOsIds}
            onChange={setSelectedOsIds}
          />
          <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button type="button" variant="outline" onClick={clearFilters}>
              Limpar filtros
            </Button>
            <Button type="button" onClick={() => setShowFilterModal(false)}>
              Fechar
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
