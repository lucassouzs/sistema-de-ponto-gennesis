'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Filter, Search, X, FileText, Receipt, Trash2, MoreVertical } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatOsSePastaOrDash } from '@/lib/formatOsSePasta';
import {
  HIST_ETIQUETA_FILTER_OPTIONS,
  HIST_MONTH_FILTER_OPTIONS,
  HISTORICO_ETIQUETA_FATURADO_PARCIAL,
  HISTORICO_ETIQUETA_PENDENTE,
  buildDisplayIdMap,
  canHistoricoFaturar,
  canHistoricoFaturar100,
  canHistoricoFaturarRestante,
  formatDisplayId,
  formatHistoricoCurrency,
  getDateMonth,
  getDateYear,
  getHistoricoEtiqueta,
  getPleitoBillableTotal,
  getPleitoLinkedBillings,
  getPleitoRemainingBalance,
  historicoEtiquetaBadgeClass,
  isGeneratedPleito,
  isPleitoFullyBilled,
  parseBudgetToNumberSafe,
  parseHistoricoCurrencyInput,
  type ContractBillingHistorico,
  type ContractPleitoHistorico,
} from '@/lib/contractHistoricoPleitos';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TableCheckbox } from '@/components/ui/Checkbox';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { cadastroListClasses, RowActionMenuCell, RowActionMenuPortal } from '@/components/ui/RowActionMenu';
import { listTableRowClasses, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { CadastroListSummary, getCadastroListRange } from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { ROW_ACTION_MENU_WIDTH_PX, type RowActionMenuState, useRowActionMenu } from '@/hooks/useRowActionMenu';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

const LIST_DISPLAY_LIMIT = 10;

const LIST_SEARCH_INPUT_CLASS =
  'h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

function billingStatusAfterFaturamento(
  pleito: ContractPleitoHistorico,
  billings: ContractBillingHistorico[],
  mode: 'saldo' | 'parcial',
  partialValue?: number
): 'pago' | 'nao-pago' {
  if (mode === 'saldo') return 'pago';
  const remaining = getPleitoRemainingBalance(pleito, billings);
  return (partialValue ?? 0) >= remaining - 0.01 ? 'pago' : 'nao-pago';
}

function FaturamentoModeRadio({
  checked,
  onChange,
  title,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  description: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={`group flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 transition-colors dark:border-gray-600 dark:bg-gray-800 ${
        disabled
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/60'
      }`}
    >
      <div className="relative shrink-0 pt-0.5">
        <input
          type="radio"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="sr-only"
        />
        <div
          className={`flex h-5 w-5 items-center justify-center rounded-full border-2 transition-all duration-200 ${
            checked
              ? 'border-red-600 dark:border-red-500'
              : 'border-gray-300 bg-white group-hover:border-red-400 dark:border-gray-600 dark:bg-gray-800 dark:group-hover:border-red-400'
          }`}
        >
          {checked ? <div className="h-2.5 w-2.5 rounded-full bg-red-600 dark:bg-red-500" /> : null}
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{title}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
      </div>
    </label>
  );
}

export function ContractHistoricoPleitosPanel({ contractId }: { contractId: string }) {
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState('');
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [histYearFilter, setHistYearFilter] = useState('all');
  const [histMonthFilter, setHistMonthFilter] = useState('all');
  const [histEtiquetaFilter, setHistEtiquetaFilter] = useState('all');
  const [selectedPleitos, setSelectedPleitos] = useState<Set<string>>(new Set());
  const [showBatchNfModal, setShowBatchNfModal] = useState(false);
  const [batchInvoiceValue, setBatchInvoiceValue] = useState('');
  const [batchFaturamentoMode, setBatchFaturamentoMode] = useState<'saldo' | 'parcial'>('saldo');
  const [batchPartialValue, setBatchPartialValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [selectionMenu, setSelectionMenu] = useState<RowActionMenuState>(null);

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

  const allPleitos = (pleitosData?.data || []) as ContractPleitoHistorico[];
  const billings = ((billingsData?.data || []) as ContractBillingHistorico[]) || [];

  const generatedPleitos = useMemo(
    () => allPleitos.filter((p) => isGeneratedPleito(p)),
    [allPleitos]
  );

  const historicoYears = useMemo(() => {
    const years = new Set<number>();
    generatedPleitos.forEach((p) => {
      const y = p.creationYear ?? getDateYear(p.createdAt as unknown as string);
      if (y) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [generatedPleitos]);

  const histYearFilterOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: 'all', label: 'Todos' },
        ...historicoYears.map((y) => ({ value: String(y), label: String(y) })),
      ]),
    [historicoYears]
  );

  const filteredPleitos = useMemo(() => {
    const searchQuery = searchTerm.trim().toLowerCase();
    const includeFaturados100 = histEtiquetaFilter === 'faturado-100';

    return generatedPleitos.filter((p) => {
      if (!includeFaturados100 && isPleitoFullyBilled(p, billings)) return false;

      const year = p.creationYear ?? getDateYear(p.createdAt as unknown as string);
      const monthRaw = p.creationMonth ? parseInt(String(p.creationMonth).replace(/\D/g, '') || '0', 10) : null;
      const month = monthRaw && monthRaw > 0 ? monthRaw : getDateMonth(p.createdAt as unknown as string);

      if (histYearFilter !== 'all' && year !== Number(histYearFilter)) return false;
      if (histMonthFilter !== 'all' && month !== Number(histMonthFilter)) return false;
      if (searchQuery) {
        const haystack = [p.divSe, p.folderNumber, p.serviceDescription, p.invoiceNumber]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchQuery)) return false;
      }
      if (histEtiquetaFilter === 'pendente' && getHistoricoEtiqueta(p, billings) !== HISTORICO_ETIQUETA_PENDENTE) {
        return false;
      }
      if (histEtiquetaFilter === 'faturado-100' && !isPleitoFullyBilled(p, billings)) return false;
      if (
        histEtiquetaFilter === 'faturado-parcial' &&
        getHistoricoEtiqueta(p, billings) !== HISTORICO_ETIQUETA_FATURADO_PARCIAL
      ) {
        return false;
      }
      return true;
    });
  }, [
    generatedPleitos,
    histYearFilter,
    histMonthFilter,
    searchTerm,
    histEtiquetaFilter,
    billings,
  ]);

  const hasActiveFilter = Boolean(
    histYearFilter !== 'all' ||
      histMonthFilter !== 'all' ||
      histEtiquetaFilter !== 'all'
  );

  const clearFilters = () => {
    setHistYearFilter('all');
    setHistMonthFilter('all');
    setHistEtiquetaFilter('all');
  };

  useEffect(() => {
    setListPage(1);
  }, [searchTerm, histYearFilter, histMonthFilter, histEtiquetaFilter]);

  const displayedPleitos = useMemo(() => {
    const start = (listPage - 1) * LIST_DISPLAY_LIMIT;
    return filteredPleitos.slice(start, start + LIST_DISPLAY_LIMIT);
  }, [filteredPleitos, listPage]);

  const listRange = useMemo(
    () => getCadastroListRange(listPage, LIST_DISPLAY_LIMIT, filteredPleitos.length),
    [listPage, filteredPleitos.length]
  );

  const pleitoDisplayIds = useMemo(() => buildDisplayIdMap(generatedPleitos), [generatedPleitos]);
  const billingDisplayIds = useMemo(() => buildDisplayIdMap(billings), [billings]);

  const displayedPleitoIds = useMemo(() => displayedPleitos.map((p) => p.id), [displayedPleitos]);

  const {
    rowActionMenu,
    rowForActionMenu: pleitoForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(displayedPleitos);

  const invalidateQueries = async () => {
    await queryClient.invalidateQueries({ queryKey: ['contract-pleitos', contractId] });
    await queryClient.invalidateQueries({ queryKey: ['contract-billings', contractId] });
  };

  const toggleSelectionMenu = (button: HTMLButtonElement) => {
    setSelectionMenu((prev) => {
      if (prev) return null;
      const rect = button.getBoundingClientRect();
      let left = rect.right - ROW_ACTION_MENU_WIDTH_PX;
      left = Math.max(8, Math.min(left, window.innerWidth - ROW_ACTION_MENU_WIDTH_PX - 8));
      return { rowId: 'pleito-selection-toolbar', top: rect.bottom + 4, left };
    });
  };

  useEffect(() => {
    if (selectedPleitos.size === 0) setSelectionMenu(null);
  }, [selectedPleitos.size]);

  useEffect(() => {
    if (!selectionMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectionMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectionMenu]);

  useEffect(() => {
    setSelectedPleitos(new Set());
    setShowBatchNfModal(false);
    setBatchInvoiceValue('');
    setBatchPartialValue('');
  }, [contractId]);

  const patchPleitoFaturamento = async (
    pleito: ContractPleitoHistorico,
    invoiceNumber: string,
    billingStatus: 'pago' | 'nao-pago',
    options?: {
      usarOrcamento100?: boolean;
      faturarRestante?: boolean;
      faturarValor?: boolean;
      valorFaturamento?: number;
    }
  ) => {
    const orc = parseBudgetToNumberSafe(pleito.budget);
    const payload: {
      billingStatus: string;
      invoiceNumber: string | null;
      billingRequest?: string;
      faturar100?: boolean;
      faturarRestante?: boolean;
      faturarValor?: boolean;
      valorFaturamento?: number;
    } = {
      billingStatus,
      invoiceNumber: invoiceNumber.trim() || null,
    };
    if (options?.usarOrcamento100 && orc > 0) {
      payload.billingRequest = orc.toFixed(2);
      payload.faturar100 = true;
    }
    if (options?.faturarRestante) {
      payload.faturarRestante = true;
    }
    if (options?.faturarValor && options.valorFaturamento != null) {
      payload.faturarValor = true;
      payload.valorFaturamento = options.valorFaturamento;
    }
    await api.patch(`/pleitos/${pleito.id}`, payload);
  };

  const filteredPleitoIds = useMemo(() => filteredPleitos.map((p) => p.id), [filteredPleitos]);
  const allVisibleSelected =
    displayedPleitoIds.length > 0 && displayedPleitoIds.every((id) => selectedPleitos.has(id));
  const someVisibleSelected = displayedPleitoIds.some((id) => selectedPleitos.has(id));

  const selectedFilteredPleitos = useMemo(
    () =>
      filteredPleitoIds
        .filter((id) => selectedPleitos.has(id))
        .map((id) => generatedPleitos.find((p) => p.id === id))
        .filter((p): p is ContractPleitoHistorico => !!p),
    [filteredPleitoIds, selectedPleitos, generatedPleitos]
  );

  const canFaturarSelected = useMemo(
    () => selectedFilteredPleitos.some((p) => canHistoricoFaturar(p, billings)),
    [selectedFilteredPleitos, billings]
  );

  const selectedFaturavelPleitos = useMemo(
    () => selectedFilteredPleitos.filter((p) => canHistoricoFaturar(p, billings)),
    [selectedFilteredPleitos, billings]
  );

  const partialMaxSaldo =
    selectedFaturavelPleitos.length === 1
      ? getPleitoRemainingBalance(selectedFaturavelPleitos[0], billings)
      : null;

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedPleitos((prev) => {
      const next = new Set(prev);
      if (checked) {
        displayedPleitoIds.forEach((id) => next.add(id));
      } else {
        displayedPleitoIds.forEach((id) => next.delete(id));
      }
      return next;
    });
  };

  const openFaturarModal = () => {
    const ids = Array.from(selectedPleitos).filter((id) => filteredPleitoIds.includes(id));
    if (ids.length === 0) {
      toast.error('Selecione ao menos um pleito.');
      return;
    }
    const aptos = ids.filter((id) => {
      const pleito = generatedPleitos.find((p) => p.id === id);
      return pleito && canHistoricoFaturar(pleito, billings);
    });
    if (aptos.length === 0) {
      toast.error('Nenhum pleito selecionado possui saldo para faturar.');
      return;
    }
    setBatchFaturamentoMode('saldo');
    setBatchInvoiceValue('');
    setBatchPartialValue('');
    setShowBatchNfModal(true);
  };

  const openFaturarModalForPleito = (pleitoId: string) => {
    const pleito = generatedPleitos.find((p) => p.id === pleitoId);
    if (!pleito || !canHistoricoFaturar(pleito, billings)) {
      toast.error('Este pleito não possui saldo para faturar.');
      return;
    }
    setSelectedPleitos(new Set([pleitoId]));
    setBatchFaturamentoMode('saldo');
    setBatchInvoiceValue('');
    setBatchPartialValue('');
    setShowBatchNfModal(true);
    closeRowActionMenu();
  };

  const removePleitos = async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      toast.error('Selecione ao menos um pleito para remover.');
      return;
    }
    const label =
      uniqueIds.length === 1
        ? 'Remover este pleito? O valor pleiteado será desfeito. Esta ação não pode ser desfeita.'
        : `Remover ${uniqueIds.length} pleitos selecionados? O valor pleiteado será desfeito. Esta ação não pode ser desfeita.`;
    if (!window.confirm(label)) return;

    setIsRemoving(true);
    try {
      await Promise.all(uniqueIds.map((id) => api.delete(`/pleitos/${id}`)));
      setSelectedPleitos(new Set());
      closeRowActionMenu();
      await invalidateQueries();
      toast.success(
        uniqueIds.length === 1
          ? 'Pleito removido (faturamentos vinculados também foram excluídos).'
          : `${uniqueIds.length} pleitos removidos (faturamentos vinculados também foram excluídos).`
      );
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast.error(ax.response?.data?.message || 'Erro ao remover pleito');
    } finally {
      setIsRemoving(false);
    }
  };

  const handleRemoverPleitosSelecionados = () => {
    const ids = Array.from(selectedPleitos).filter((id) => filteredPleitoIds.includes(id));
    void removePleitos(ids);
  };

  const handleRemoverPleito = (pleitoId: string) => {
    void removePleitos([pleitoId]);
  };

  const confirmBatchFaturamento = async () => {
    const pleitosAptos = selectedFaturavelPleitos;
    if (pleitosAptos.length === 0) {
      toast.error('Nenhum pleito selecionado possui saldo para faturar.');
      return;
    }

    const invoice = batchInvoiceValue.trim();
    if (!invoice) {
      toast.error('Informe o número da nota fiscal.');
      return;
    }

    const isParcial = batchFaturamentoMode === 'parcial';
    if (isParcial && pleitosAptos.length !== 1) {
      toast.error('Para faturar valor parcial, selecione apenas um pleito por vez.');
      return;
    }

    let valorParcial = 0;
    if (isParcial) {
      valorParcial = parseHistoricoCurrencyInput(batchPartialValue);
      if (valorParcial <= 0) {
        toast.error('Informe um valor parcial válido.');
        return;
      }
      const maxSaldo = getPleitoRemainingBalance(pleitosAptos[0], billings);
      if (valorParcial > maxSaldo + 0.01) {
        toast.error(`O valor não pode exceder o saldo disponível (${formatHistoricoCurrency(maxSaldo)}).`);
        return;
      }
    }

    const idsProcessados = isParcial
      ? [pleitosAptos[0].id]
      : pleitosAptos
          .map((p) => {
            if (canHistoricoFaturar100(p, billings)) return p.id;
            if (canHistoricoFaturarRestante(p, billings)) return p.id;
            return null;
          })
          .filter((id): id is string => !!id);

    if (idsProcessados.length === 0) {
      toast.error('Nenhum pleito selecionado possui saldo para faturar.');
      return;
    }

    setIsSaving(true);
    try {
      await Promise.all(
        idsProcessados.map(async (id) => {
          const pleito = generatedPleitos.find((p) => p.id === id);
          if (!pleito) return;
          if (isParcial) {
            const billingStatus = billingStatusAfterFaturamento(pleito, billings, 'parcial', valorParcial);
            await patchPleitoFaturamento(pleito, invoice, billingStatus, {
              faturarValor: true,
              valorFaturamento: valorParcial,
            });
            return;
          }
          const billingStatus = billingStatusAfterFaturamento(pleito, billings, 'saldo');
          if (canHistoricoFaturar100(pleito, billings)) {
            await patchPleitoFaturamento(pleito, invoice, billingStatus, { usarOrcamento100: true });
          } else {
            await patchPleitoFaturamento(pleito, invoice, billingStatus, { faturarRestante: true });
          }
        })
      );
      await invalidateQueries();
      setShowBatchNfModal(false);
      setBatchInvoiceValue('');
      setBatchPartialValue('');
      toast.success(
        isParcial
          ? `Pleito faturado parcialmente (${formatHistoricoCurrency(valorParcial)}) com NF ${invoice}.`
          : `${idsProcessados.length} pleito(s) faturado(s) com NF ${invoice}.`
      );
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Não foi possível faturar os pleitos selecionados.';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading = loadingPleitos || loadingBillings;
  const pleitoCountLabel = isLoading
    ? 'Carregando...'
    : filteredPleitos.length === 1
      ? '1 pleito'
      : `${filteredPleitos.length} pleitos`;

  return (
    <>
      <Card>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className="rounded-lg bg-violet-100 p-2 sm:p-3 dark:bg-violet-900/30">
                <FileText className="h-5 w-5 text-violet-600 dark:text-violet-400 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">Pleitos</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{pleitoCountLabel}</p>
              </div>
            </div>
            {generatedPleitos.length > 0 ? (
              <div className={cadastroListClasses.cardToolbar}>
                {selectedPleitos.size > 0 ? (
                  <button
                    type="button"
                    onClick={(e) => toggleSelectionMenu(e.currentTarget)}
                    className={`relative ${rowActionMenuButtonClass(selectionMenu !== null)}`}
                    aria-label="Ações dos pleitos selecionados"
                    aria-expanded={selectionMenu !== null}
                    aria-haspopup="menu"
                    title={`Ações (${selectedPleitos.size} selecionado${selectedPleitos.size === 1 ? '' : 's'})`}
                  >
                    <MoreVertical className="h-4 w-4" />
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-semibold leading-none text-white">
                      {selectedPleitos.size}
                    </span>
                  </button>
                ) : null}
                <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Buscar OS, descrição, pasta, NF..."
                    className={`${LIST_SEARCH_INPUT_CLASS} focus:ring-violet-500`}
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
                <button
                  type="button"
                  onClick={() => setShowFilterModal(true)}
                  className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    hasActiveFilter
                      ? 'border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100 dark:border-violet-800/60 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                  }`}
                  aria-label="Abrir filtro"
                  title={hasActiveFilter ? 'Filtro (ativo)' : 'Filtro'}
                >
                  <Filter className="h-4 w-4" />
                  {hasActiveFilter ? (
                    <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-violet-500 ring-2 ring-white dark:ring-gray-900" />
                  ) : null}
                </button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        {selectionMenu ? (
          <RowActionMenuPortal
            menu={selectionMenu}
            onClose={() => setSelectionMenu(null)}
            onEdit={() => {}}
            onDelete={() => {}}
            hideDefaultActions
            extraItems={[
              {
                label: 'Faturar',
                disabled: isSaving || isRemoving || !canFaturarSelected,
                disabledTitle: !canFaturarSelected
                  ? 'Nenhum pleito selecionado possui saldo para faturar'
                  : 'Faturar selecionados',
                onClick: () => {
                  setSelectionMenu(null);
                  openFaturarModal();
                },
                icon: <Receipt className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />,
              },
              {
                label: isRemoving ? 'Excluindo...' : 'Excluir',
                disabled: isSaving || isRemoving,
                disabledTitle: 'Excluindo...',
                onClick: () => {
                  setSelectionMenu(null);
                  handleRemoverPleitosSelecionados();
                },
                icon: <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />,
              },
            ]}
          />
        ) : null}
        <CardContent className={cadastroListClasses.cardContent}>
          {isLoading ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">Carregando...</div>
          ) : generatedPleitos.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="mx-auto mb-3 h-12 w-12 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400">Nenhum pleito gerado até o momento.</p>
            </div>
          ) : filteredPleitos.length === 0 ? (
            <div className="p-8 text-center">
              <FileText className="mx-auto mb-3 h-12 w-12 text-gray-300 dark:text-gray-600" />
              <p className="text-gray-500 dark:text-gray-400">
                {generatedPleitos.length === 0
                  ? 'Nenhum pleito gerado até o momento.'
                  : 'Nenhum pleito encontrado.'}
              </p>
            </div>
          ) : (
            <>
              <CadastroListSummary
                startItem={listRange.startItem}
                endItem={listRange.endItem}
                total={filteredPleitos.length}
                itemLabel="pleito"
                itemLabelPlural="pleitos"
                currentPage={listPage}
                totalPages={listRange.totalPages}
              />
              <div className="table-scroll">
                <table className="w-full text-sm" data-cc-skip-column-customizer="1">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="w-12 px-3 py-3 text-center text-xs font-medium uppercase text-gray-500 dark:text-gray-400 align-middle">
                        <div className="flex justify-center">
                          <TableCheckbox
                            checked={allVisibleSelected}
                            indeterminate={someVisibleSelected && !allVisibleSelected}
                            onChange={toggleSelectAllVisible}
                            onClick={(e) => e.stopPropagation()}
                            ariaLabel="Selecionar pleitos visíveis"
                          />
                        </div>
                      </th>
                      <th className={`${cadastroListClasses.th} whitespace-nowrap align-middle`}>ID</th>
                      <th className={`${cadastroListClasses.th} whitespace-nowrap align-middle`}>OS / SE</th>
                      <th className={`${cadastroListClasses.th} align-middle`}>Descrição</th>
                      <th className={`${cadastroListClasses.thNumeric} align-middle`}>Valor pleiteado</th>
                      <th className={`${cadastroListClasses.thCenter} whitespace-nowrap align-middle`}>Fat.</th>
                      <th className={`${cadastroListClasses.thNumeric} align-middle whitespace-nowrap`}>Valor faturado</th>
                      <th className={`${cadastroListClasses.thNumeric} align-middle whitespace-nowrap`}>Restante a faturar</th>
                      <th className={`${cadastroListClasses.thCenter} whitespace-nowrap align-middle`}>Status</th>
                      <th className={`${listTableRowClasses.actionTh} align-middle`}>Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {displayedPleitos.map((p) => {
                      const valorPleito = p.billingRequest ? Number(p.billingRequest) : 0;
                      const totalFaturavel = getPleitoBillableTotal(p);
                      const restanteFaturar = getPleitoRemainingBalance(p, billings);
                      const etiqueta = getHistoricoEtiqueta(p, billings);
                      const isSelected = selectedPleitos.has(p.id);
                      const linkedBillings = getPleitoLinkedBillings(p, billings);

                      return (
                        <tr
                          key={p.id}
                          className={`${listTableRowClasses.tr} ${isSelected ? 'bg-violet-50/50 dark:bg-violet-900/10' : ''}`}
                        >
                          <td className="px-3 py-3 align-middle" onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-center">
                              <TableCheckbox
                                checked={isSelected}
                                onChange={(checked) =>
                                  setSelectedPleitos((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(p.id);
                                    else next.delete(p.id);
                                    return next;
                                  })
                                }
                                ariaLabel={`Selecionar pleito ${formatOsSePastaOrDash(p.divSe, p.folderNumber)}`}
                              />
                            </div>
                          </td>
                          <td className={`${cadastroListClasses.tdMono} align-middle whitespace-nowrap`}>
                            {formatDisplayId(pleitoDisplayIds, p.id)}
                          </td>
                          <td className={`${cadastroListClasses.tdMono} align-middle whitespace-nowrap`}>
                            {formatOsSePastaOrDash(p.divSe, p.folderNumber)}
                          </td>
                          <td className={`${cadastroListClasses.tdTruncate} align-middle`} title={p.serviceDescription}>
                            <span className="block truncate">{p.serviceDescription || '—'}</span>
                          </td>
                          <td className={`${cadastroListClasses.tdNumeric} align-middle text-gray-900 dark:text-gray-100`}>
                            {formatHistoricoCurrency(valorPleito)}
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} align-middle`}>
                            {linkedBillings.length === 0 ? (
                              <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                            ) : (
                              <div className="flex flex-col items-center gap-0.5">
                                {linkedBillings.map((b) => (
                                  <span
                                    key={b.id}
                                    className="block font-mono text-xs font-medium text-gray-900 dark:text-gray-100"
                                    title={
                                      b.invoiceNumber
                                        ? `NF ${b.invoiceNumber}`
                                        : `Fat. ${formatDisplayId(billingDisplayIds, b.id)}`
                                    }
                                  >
                                    {formatDisplayId(billingDisplayIds, b.id)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className={`${cadastroListClasses.tdNumeric} align-middle text-gray-900 dark:text-gray-100`}>
                            {linkedBillings.length === 0 ? (
                              <span className="whitespace-nowrap text-xs font-medium tabular-nums">
                                {formatHistoricoCurrency(0)}
                              </span>
                            ) : (
                              <div className="flex flex-col items-end gap-0.5">
                                {linkedBillings.map((b) => (
                                  <span
                                    key={b.id}
                                    className="block whitespace-nowrap text-xs font-medium tabular-nums"
                                    title={
                                      b.invoiceNumber
                                        ? `NF ${b.invoiceNumber}`
                                        : `Fat. ${formatDisplayId(billingDisplayIds, b.id)}`
                                    }
                                  >
                                    {formatHistoricoCurrency(Number(b.grossValue || 0))}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className={`${cadastroListClasses.tdNumeric} align-middle text-gray-900 dark:text-gray-100`}>
                            {totalFaturavel > 0 ? formatHistoricoCurrency(restanteFaturar) : '—'}
                          </td>
                          <td className={`${cadastroListClasses.tdCenter} align-middle whitespace-nowrap`}>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${historicoEtiquetaBadgeClass(etiqueta)}`}
                            >
                              {etiqueta}
                            </span>
                          </td>
                          <RowActionMenuCell
                            isOpen={isRowMenuOpen(p.id)}
                            onToggle={(e) => toggleRowActionMenu(p.id, e.currentTarget)}
                          />
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {rowActionMenu && pleitoForActionMenu ? (
                  <RowActionMenuPortal
                    menu={rowActionMenu}
                    onClose={closeRowActionMenu}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    hideDefaultActions
                    extraItems={[
                      {
                        label: 'Faturar',
                        disabled: !canHistoricoFaturar(pleitoForActionMenu, billings),
                        disabledTitle: 'Este pleito não possui saldo para faturar',
                        onClick: () => openFaturarModalForPleito(pleitoForActionMenu.id),
                        icon: (
                          <Receipt className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                        ),
                      },
                      {
                        label: isRemoving ? 'Removendo...' : 'Remover pleito',
                        disabled: isRemoving,
                        disabledTitle: 'Removendo...',
                        onClick: () => handleRemoverPleito(pleitoForActionMenu.id),
                        icon: (
                          <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                        ),
                      },
                    ]}
                  />
                ) : null}
              </div>
              <ListPagination
                currentPage={listPage}
                totalPages={listRange.totalPages}
                onPageChange={setListPage}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        title="Filtros — Pleitos"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Mês</label>
            <StringSingleSelectDropdown
              value={histMonthFilter}
              onChange={setHistMonthFilter}
              options={HIST_MONTH_FILTER_OPTIONS}
              allowEmpty={false}
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Ano</label>
            <StringSingleSelectDropdown
              value={histYearFilter}
              onChange={setHistYearFilter}
              options={histYearFilterOptions}
              allowEmpty={false}
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
            <StringSingleSelectDropdown
              value={histEtiquetaFilter}
              onChange={setHistEtiquetaFilter}
              options={HIST_ETIQUETA_FILTER_OPTIONS}
              allowEmpty={false}
              className="w-full"
            />
          </div>
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

      <Modal
        isOpen={showBatchNfModal}
        onClose={() => setShowBatchNfModal(false)}
        title="Faturar pleitos selecionados"
        size="md"
        elevated
      >
        <div className="space-y-4">
          <div>
            <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de faturamento</p>
            <div className="space-y-2">
              <FaturamentoModeRadio
                checked={batchFaturamentoMode === 'saldo'}
                onChange={() => setBatchFaturamentoMode('saldo')}
                title="Faturar saldo total"
                description="Quita o saldo restante de cada pleito selecionado (100% ou saldo pendente)."
              />
              <FaturamentoModeRadio
                checked={batchFaturamentoMode === 'parcial'}
                onChange={() => setBatchFaturamentoMode('parcial')}
                disabled={selectedFaturavelPleitos.length !== 1}
                title="Faturar valor parcial"
                description={
                  selectedFaturavelPleitos.length !== 1
                    ? 'Disponível apenas com um pleito selecionado.'
                    : partialMaxSaldo != null
                      ? `Informe um valor até ${formatHistoricoCurrency(partialMaxSaldo)}.`
                      : 'Informe o valor a faturar.'
                }
              />
            </div>
          </div>

          {batchFaturamentoMode === 'parcial' && selectedFaturavelPleitos.length === 1 ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Valor a faturar
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 dark:text-gray-400">
                  R$
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={batchPartialValue}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, '');
                    const formatted = digits
                      ? (Number(digits) / 100).toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })
                      : '';
                    setBatchPartialValue(formatted);
                  }}
                  placeholder="0,00"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                />
              </div>
            </div>
          ) : null}

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Número da Nota Fiscal
            </label>
            <input
              type="text"
              value={batchInvoiceValue}
              onChange={(e) => setBatchInvoiceValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void confirmBatchFaturamento();
              }}
              placeholder="Ex: 000123"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button type="button" variant="outline" onClick={() => setShowBatchNfModal(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void confirmBatchFaturamento()} disabled={isSaving}>
              {isSaving ? 'Faturando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
