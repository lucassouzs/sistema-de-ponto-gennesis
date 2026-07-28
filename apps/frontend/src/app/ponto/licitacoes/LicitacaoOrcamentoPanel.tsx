'use client';

import React, { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calculator,
  ChevronDown,
  ChevronRight,
  Download,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import api from '@/lib/api';
import { exportLicitacaoOrcamentoPdf } from '@/lib/exportLicitacaoOrcamentoPdf';
import {
  formatCurrencyInputBrFromNumber,
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';
import { buildLicitacaoTituloDisplay } from './licitacaoDisplay';
import {
  addExpenseType,
  computeLicitacaoOrcamentoResult,
  DEFAULT_LICITACAO_ORCAMENTO_FORMULAS,
  emptyLicitacaoOrcamentoInputs,
  getLicitacaoOrcamentoFormulaFieldGroups,
  LICITACAO_ORCAMENTO_FORMULA_LABELS,
  LICITACAO_ORCAMENTO_FORMULA_ORDER,
  normalizeLicitacaoOrcamentoInputs,
  removeExpenseType,
  renameExpenseType,
  resolveBdiComponentBase,
  resolveCategoryTotals,
  resolveEncargosBase,
  syncDualFromMoney,
  syncDualFromPercent,
  withResyncedDualFields,
  type DualMoneyPercent,
  type LicitacaoOrcamentoFormulaKey,
  type LicitacaoOrcamentoInputs,
  type LicitacaoOrcamentoLine,
  type LicitacaoOrcamentoLineCategory,
  type LicitacaoOrcamentoResult,
} from './licitacaoOrcamentoCalc';

const BRASIL_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

type DecisaoAnaliseFinal = 'participar' | 'participar_consorcio' | 'nao_participar';

const DECISAO_OPTIONS: Array<{ value: DecisaoAnaliseFinal; label: string }> = [
  { value: 'participar', label: 'Participar' },
  { value: 'participar_consorcio', label: 'Participar em consórcio' },
  { value: 'nao_participar', label: 'Não participar' },
];

function isDecisaoValue(value: unknown): value is DecisaoAnaliseFinal {
  return DECISAO_OPTIONS.some((item) => item.value === value);
}

function decisaoLabel(decisao: DecisaoAnaliseFinal): string {
  return DECISAO_OPTIONS.find((item) => item.value === decisao)?.label ?? decisao;
}

function decisaoBadgeClass(decisao: DecisaoAnaliseFinal, active: boolean): string {
  if (active) {
    switch (decisao) {
      case 'participar':
        return 'bg-emerald-400/30 text-emerald-950 dark:text-emerald-100';
      case 'participar_consorcio':
        return 'bg-sky-400/30 text-sky-950 dark:text-sky-100';
      case 'nao_participar':
        return 'bg-rose-400/30 text-rose-950 dark:text-rose-100';
    }
  }
  switch (decisao) {
    case 'participar':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300';
    case 'participar_consorcio':
      return 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300';
    case 'nao_participar':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300';
  }
}

function statusBadgeClass(active: boolean): string {
  return active
    ? 'bg-indigo-400/30 text-indigo-950 dark:text-indigo-100'
    : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300';
}

function formatDateOnly(iso?: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return '';
  }
}

type LicitacaoRegiaoTab = { key: string; label: string };

type LicitacaoListItem = {
  id: string;
  titulo: string;
  numeroProcesso?: string | null;
  orgao?: string | null;
  valorEstimado?: string | null;
  estado?: string | null;
  regiaoKey?: string | null;
  arquivada?: boolean;
  arquivadaMotivo?: string | null;
  arquivadaEm?: string | null;
  updatedAt?: string;
  analiseJson?: {
    decisaoAnaliseFinal?: DecisaoAnaliseFinal | null;
    origemRegiao?: {
      estado?: string | null;
      rowSnapshot?: Record<string, string> | null;
    } | null;
  } | null;
};

type OrcamentoPayload = {
  id: string;
  licitacaoId: string;
  inputs: LicitacaoOrcamentoInputs;
  result: LicitacaoOrcamentoResult;
  draft?: boolean;
  updatedAt?: string;
};

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

const ORCAMENTO_FIELD_DEFINITIONS: Record<string, string> = {
  'Preço-teto / referência do edital':
    'Valor máximo de referência do edital (preço-teto). Serve de base para desconto simulado e para o desconto máximo.',
  'Encargos sociais':
    'Encargos sobre a mão de obra (INSS, FGTS, etc.). Podem ser informados em R$ ou % sobre o total de mão de obra.',
  'Margem mínima':
    'Lucro mínimo que a empresa aceita manter no preço. É o limite de segurança: o preço não pode cair a ponto de a margem real ficar abaixo disso.',
  'Desconto simulado':
    'Desconto de teste sobre o preço-teto, para simular o que aconteceria se a empresa desse aquele desconto no lance. Não é o desconto máximo permitido.',
  'Custo indireto':
    'Despesas indiretas do BDI (administração, suporte, etc.), em R$ ou % sobre custo direto + encargos.',
  Lucro:
    'Parte do BDI que representa o lucro desejado da empresa, em R$ ou % sobre custo direto + encargos.',
  Tributo:
    'Tributos/impostos incluídos no BDI, em R$ ou % sobre custo direto + encargos.',
  'Custo direto total':
    'Soma de todos os tipos de gasto (mão de obra, material, sistemas, etc.).',
  BDI:
    'Bonificações e Despesas Indiretas: custo indireto + lucro + tributo. Aparece em R$ e em % sobre o custo direto + encargos.',
  Impostos:
    'Valor de tributos considerado no resultado (em geral o mesmo informado em Tributo).',
  'Preço mínimo viável':
    'Menor preço de venda que ainda cobre custo direto, encargos e BDI, respeitando a margem mínima. Abaixo disso, a participação deixa de ser interessante.',
  'Desconto máximo':
    'Maior desconto (%) em relação ao preço-teto do edital sem ir abaixo do preço mínimo viável.',
  'Margem no desconto simulado':
    'Margem real (%) que sobraria se o lance fosse o preço-teto menos o desconto simulado. Compare com a margem mínima: se for menor, o desconto simulado é agressivo demais.',
};

function FieldInfoButton({ definition }: { definition: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    const place = () => {
      const anchor = rootRef.current;
      const tip = tipRef.current;
      if (!anchor || !tip) return;

      const rect = anchor.getBoundingClientRect();
      const tipWidth = tip.offsetWidth;
      const tipHeight = tip.offsetHeight;
      const margin = 8;

      let left = rect.left;
      if (left + tipWidth > window.innerWidth - margin) {
        left = rect.right - tipWidth;
      }
      if (left < margin) left = margin;

      let top = rect.bottom + 6;
      if (top + tipHeight > window.innerHeight - margin) {
        const above = rect.top - tipHeight - 6;
        if (above >= margin) top = above;
      }

      setCoords({ top, left });
    };

    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, definition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || tipRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center justify-center text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        aria-label="Ver definição"
        aria-expanded={open}
        title="Ver definição"
      >
        <Info className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
      </button>
      {open
        ? createPortal(
            <span
              ref={tipRef}
              role="tooltip"
              style={{
                position: 'fixed',
                top: coords?.top ?? 0,
                left: coords?.left ?? 0,
                visibility: coords ? 'visible' : 'hidden',
              }}
              className="z-[200] w-64 rounded-lg border border-gray-200 bg-white p-2.5 text-left text-[11px] font-normal normal-case leading-relaxed tracking-normal text-gray-700 shadow-lg dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
            >
              {definition}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

function MoneyField({
  label,
  value,
  onChange,
  placeholder = 'R$ 0,00',
  definition,
}: {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  definition?: string;
}) {
  const display =
    value === 0 ? '' : formatCurrencyInputBrFromNumber(value);

  return (
    <label className="block">
      {label ? (
        <span className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
          {definition ? <FieldInfoButton definition={definition} /> : null}
        </span>
      ) : null}
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        placeholder={placeholder}
        onChange={(e) => {
          const masked = maskCurrencyInputBrOrEmpty(e.target.value);
          onChange(parseCurrencyInputBr(masked) ?? 0);
        }}
        className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
      />
    </label>
  );
}

function DualMoneyPercentField({
  label,
  value,
  base,
  onChange,
  definition,
}: {
  label: string;
  value: DualMoneyPercent;
  base: number;
  onChange: (next: DualMoneyPercent) => void;
  definition?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </span>
        {definition ? <FieldInfoButton definition={definition} /> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-gray-500">Valor (R$)</span>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={
              value.money === 0 ? '' : formatCurrencyInputBrFromNumber(value.money)
            }
            placeholder="R$ 0,00"
            onChange={(e) => {
              const masked = maskCurrencyInputBrOrEmpty(e.target.value);
              onChange(syncDualFromMoney(parseCurrencyInputBr(masked) ?? 0, base));
            }}
            className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-medium text-gray-500">Percentual (%)</span>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min={0}
              value={value.percent === 0 ? '' : Number(value.percent.toFixed(4))}
              placeholder="0"
              onChange={(e) => {
                const raw = e.target.value.trim();
                onChange(syncDualFromPercent(raw ? Number(raw) || 0 : 0, base));
              }}
              className="h-9 w-full rounded-md border border-gray-300 bg-white px-2 pr-8 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-gray-400">
              %
            </span>
          </div>
        </label>
      </div>
    </div>
  );
}

export function LicitacaoOrcamentoPanel() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<LicitacaoOrcamentoInputs>(emptyLicitacaoOrcamentoInputs());
  const [dirty, setDirty] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showFormulas, setShowFormulas] = useState(false);

  const [search, setSearch] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [regiaoKey, setRegiaoKey] = useState('');
  const [estado, setEstado] = useState('');
  const [decisaoFilter, setDecisaoFilter] = useState<DecisaoAnaliseFinal | ''>('');
  const deferredSearch = useDeferredValue(search.trim());

  const { data: regiaoTabs = [] } = useQuery({
    queryKey: ['licitacoes-planilha-regioes'],
    queryFn: async () => {
      const res = await api.get('/licitacoes/planilha-regioes');
      return (res.data?.data ?? []) as LicitacaoRegiaoTab[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: listRaw = [], isLoading: loadingList, refetch: refetchList } = useQuery({
    queryKey: [
      'licitacoes',
      'orcamento',
      deferredSearch,
      dataInicio,
      dataFim,
      regiaoKey,
      estado,
    ],
    queryFn: async () => {
      const params: Record<string, string> = {
        arquivada: 'true',
        arquivadaMotivo: 'orcamento',
      };
      if (deferredSearch) params.search = deferredSearch;
      if (dataInicio) params.dataInicio = dataInicio;
      if (dataFim) params.dataFim = dataFim;
      if (regiaoKey) params.regiaoKey = regiaoKey;
      if (estado) params.estado = estado;
      const res = await api.get('/licitacoes', { params });
      return (res.data?.data ?? []) as LicitacaoListItem[];
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const list = useMemo(() => {
    if (!decisaoFilter) return listRaw;
    return listRaw.filter(
      (item) => item.analiseJson?.decisaoAnaliseFinal === decisaoFilter
    );
  }, [decisaoFilter, listRaw]);

  useEffect(() => {
    if (!selectedId && list.length > 0) {
      setSelectedId(list[0].id);
    }
    if (selectedId && list.length > 0 && !list.some((item) => item.id === selectedId)) {
      setSelectedId(list[0]?.id ?? null);
    }
    if (selectedId && list.length === 0) {
      setSelectedId(null);
    }
  }, [list, selectedId]);

  const selectedMeta = useMemo(
    () => list.find((item) => item.id === selectedId) ?? null,
    [list, selectedId]
  );

  const {
    data: orcamento,
    isLoading: loadingOrcamento,
    isFetching: fetchingOrcamento,
  } = useQuery({
    queryKey: ['licitacao-orcamento', selectedId],
    queryFn: async () => {
      const res = await api.get(`/licitacoes/${selectedId}/orcamento`);
      return res.data?.data as OrcamentoPayload;
    },
    enabled: Boolean(selectedId),
    staleTime: 0,
  });

  useEffect(() => {
    if (!orcamento?.inputs) return;
    setInputs(normalizeLicitacaoOrcamentoInputs(orcamento.inputs));
    setDirty(false);
  }, [orcamento]);

  const liveResult = useMemo(() => computeLicitacaoOrcamentoResult(inputs), [inputs]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('Selecione uma licitação');
      const res = await api.put(`/licitacoes/${selectedId}/orcamento`, {
        inputs: normalizeLicitacaoOrcamentoInputs(inputs),
      });
      return res.data?.data as OrcamentoPayload;
    },
    onSuccess: (data) => {
      toast.success('Orçamento salvo');
      setDirty(false);
      queryClient.setQueryData(['licitacao-orcamento', selectedId], data);
      if (data?.inputs) setInputs(normalizeLicitacaoOrcamentoInputs(data.inputs));
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (error instanceof Error ? error.message : 'Erro ao salvar orçamento');
      toast.error(message);
    },
  });

  const patchInputs = (patch: Partial<LicitacaoOrcamentoInputs>) => {
    setInputs((prev) => withResyncedDualFields({ ...prev, ...patch }));
    setDirty(true);
  };

  const bdiComponentBase = useMemo(() => resolveBdiComponentBase(inputs), [inputs]);
  const encargosBase = useMemo(() => resolveEncargosBase(inputs), [inputs]);
  const descontoBase = inputs.precoReferenciaEdital;

  const resetFormula = (key: LicitacaoOrcamentoFormulaKey) => {
    patchInputs({
      formulas: {
        ...inputs.formulas,
        [key]: DEFAULT_LICITACAO_ORCAMENTO_FORMULAS[key],
      },
    });
  };

  const handleExportPdf = async () => {
    if (!selectedMeta) return;
    setExportingPdf(true);
    try {
      await exportLicitacaoOrcamentoPdf({
        titulo: buildLicitacaoTituloDisplay(selectedMeta),
        numeroProcesso: selectedMeta.numeroProcesso,
        orgao: selectedMeta.orgao,
        inputs,
        result: liveResult,
      });
      toast.success('PDF gerado');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao exportar PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const resultCards: Array<{
    label: string;
    value: string;
    tone?: string;
    definition?: string;
  }> = [
    {
      label: 'Custo direto total',
      value: formatCurrency(liveResult.custoDiretoTotal),
      definition: ORCAMENTO_FIELD_DEFINITIONS['Custo direto total'],
    },
    {
      label: 'Encargos sociais',
      value: formatCurrency(liveResult.encargosSociaisValor),
      definition: ORCAMENTO_FIELD_DEFINITIONS['Encargos sociais'],
    },
    {
      label: 'BDI',
      value: `${formatPercent(liveResult.bdiPercent)} · ${formatCurrency(liveResult.bdiValor)}`,
      definition: ORCAMENTO_FIELD_DEFINITIONS.BDI,
    },
    {
      label: 'Custo indireto',
      value: formatCurrency(liveResult.custoIndiretoTotal),
      definition: ORCAMENTO_FIELD_DEFINITIONS['Custo indireto'],
    },
    {
      label: 'Impostos',
      value: formatCurrency(liveResult.impostosValor),
      definition: ORCAMENTO_FIELD_DEFINITIONS.Impostos,
    },
    {
      label: 'Preço mínimo viável',
      value: formatCurrency(liveResult.precoMinimoViavel),
      tone: 'text-amber-700 dark:text-amber-300',
      definition: ORCAMENTO_FIELD_DEFINITIONS['Preço mínimo viável'],
    },
    {
      label: 'Desconto máximo',
      value: formatPercent(liveResult.descontoMaximoPercentual),
      tone: 'text-emerald-700 dark:text-emerald-300',
      definition: ORCAMENTO_FIELD_DEFINITIONS['Desconto máximo'],
    },
    {
      label: 'Margem no desconto simulado',
      value: formatPercent(liveResult.margemRealSimulada),
      tone:
        liveResult.margemRealSimulada < inputs.margemMinima.percent
          ? 'text-rose-700 dark:text-rose-300'
          : 'text-emerald-700 dark:text-emerald-300',
      definition: ORCAMENTO_FIELD_DEFINITIONS['Margem no desconto simulado'],
    },
  ];

  const filterInputClassName =
    'h-8 w-full rounded-md border border-gray-300 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-900';

  const categoryTotals = useMemo(() => resolveCategoryTotals(inputs), [inputs]);
  const formulaFieldGroups = useMemo(
    () => getLicitacaoOrcamentoFormulaFieldGroups(inputs.expenseTypes),
    [inputs.expenseTypes]
  );

  const addLine = (category: LicitacaoOrcamentoLineCategory) => {
    const line: LicitacaoOrcamentoLine = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `line-${Date.now()}`,
      category,
      description: '',
      amount: 0,
    };
    patchInputs({ lines: [...inputs.lines, line] });
  };

  const handleAddExpenseType = () => {
    const label = window.prompt('Nome do novo tipo de gasto:');
    if (!label?.trim()) return;
    setInputs((prev) => withResyncedDualFields(addExpenseType(prev, label)));
    setDirty(true);
  };

  const handleRenameExpenseType = (typeId: string, currentLabel: string) => {
    const label = window.prompt('Renomear tipo de gasto:', currentLabel);
    if (!label?.trim() || label.trim() === currentLabel) return;
    setInputs((prev) => withResyncedDualFields(renameExpenseType(prev, typeId, label)));
    setDirty(true);
  };

  const handleRemoveExpenseType = (typeId: string, label: string) => {
    if (
      !window.confirm(
        `Remover o tipo "${label}" e todas as linhas dele? Esta ação não remove tipos padrão.`
      )
    ) {
      return;
    }
    setInputs((prev) => withResyncedDualFields(removeExpenseType(prev, typeId)));
    setDirty(true);
  };

  const updateLine = (id: string, patch: Partial<LicitacaoOrcamentoLine>) => {
    patchInputs({
      lines: inputs.lines.map((line) => (line.id === id ? { ...line, ...patch } : line)),
    });
  };

  const removeLine = (id: string) => {
    patchInputs({ lines: inputs.lines.filter((line) => line.id !== id) });
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Card padding="none" className="overflow-hidden shadow-sm">
        <CardHeader className="space-y-2.5 border-b border-gray-100 px-4 pb-3 pt-4 dark:border-gray-800">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Orçamento
              </h2>
              <p className="mt-0.5 text-xs text-gray-400">
                {list.length} {list.length === 1 ? 'licitação' : 'licitações'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => refetchList()}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
              title="Atualizar lista"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-full rounded-md border border-gray-300 bg-white py-1.5 pl-8 pr-2 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                aria-label="De"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className={filterInputClassName}
              />
              <input
                type="date"
                aria-label="Até"
                value={dataFim}
                min={dataInicio || undefined}
                onChange={(e) => setDataFim(e.target.value)}
                className={filterInputClassName}
              />
            </div>
            <select
              aria-label="Região"
              value={regiaoKey}
              onChange={(e) => setRegiaoKey(e.target.value)}
              className={filterInputClassName}
            >
              <option value="">Todas as regiões</option>
              {regiaoTabs.map((tab) => (
                <option key={tab.key} value={tab.key}>
                  {tab.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Estado"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className={filterInputClassName}
            >
              <option value="">Todos os estados</option>
              {BRASIL_UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </select>
            <select
              aria-label="Decisão de participação"
              value={decisaoFilter}
              onChange={(e) =>
                setDecisaoFilter(e.target.value as DecisaoAnaliseFinal | '')
              }
              className={filterInputClassName}
            >
              <option value="">Todas as decisões</option>
              {DECISAO_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="max-h-[min(70vh,720px)] space-y-1 overflow-y-auto p-2">
          {loadingList ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando…
            </div>
          ) : list.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-gray-500">
              Nenhuma licitação encontrada com status <strong>Orçamento</strong>
              {deferredSearch || dataInicio || dataFim || regiaoKey || estado || decisaoFilter
                ? ' para os filtros atuais'
                : ''}
              .
            </p>
          ) : (
            list.map((item) => {
              const active = item.id === selectedId;
              const decisao = isDecisaoValue(item.analiseJson?.decisaoAnaliseFinal)
                ? item.analiseJson!.decisaoAnaliseFinal!
                : null;
              const statusDate = formatDateOnly(item.arquivadaEm ?? item.updatedAt);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-100'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 truncate text-sm font-medium">
                      {buildLicitacaoTituloDisplay(item)}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight ${statusBadgeClass(active)}`}
                      >
                        Orçamento
                      </span>
                      {decisao ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight ${decisaoBadgeClass(decisao, active)}`}
                        >
                          {decisaoLabel(decisao)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div
                    className={`mt-0.5 truncate text-xs ${active ? 'text-red-700/80 dark:text-red-200/80' : 'text-gray-500'}`}
                  >
                    {statusDate || item.orgao || item.numeroProcesso || 'Sem órgão/processo'}
                  </div>
                </button>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="space-y-5">
        {!selectedId ? (
          <Card className="shadow-sm">
            <CardContent className="py-12 text-center text-sm text-gray-500">
              Selecione uma licitação à esquerda.
            </CardContent>
          </Card>
        ) : loadingOrcamento && !orcamento ? (
          <Card className="shadow-sm">
            <CardContent className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando orçamento…
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-sm">
            <CardHeader className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-red-600" aria-hidden />
                  <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {selectedMeta ? buildLicitacaoTituloDisplay(selectedMeta) : 'Orçamento'}
                  </h2>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  Calcule o desconto máximo sem comprometer a margem mínima.
                  {orcamento?.draft ? ' (rascunho ainda não salvo)' : null}
                  {fetchingOrcamento ? ' · atualizando…' : null}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={exportingPdf}
                  className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                >
                  {exportingPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Exportar PDF
                </button>
                <button
                  type="button"
                  onClick={() => saveMutation.mutate()}
                  disabled={!dirty || saveMutation.isPending}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Salvar
                </button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6 px-5 py-5">
              <section>
                <div className="max-w-sm">
                  <MoneyField
                    label="Preço-teto / referência do edital"
                    value={inputs.precoReferenciaEdital}
                    onChange={(precoReferenciaEdital) => patchInputs({ precoReferenciaEdital })}
                    definition={ORCAMENTO_FIELD_DEFINITIONS['Preço-teto / referência do edital']}
                  />
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Gastos por tipo
                    </h3>
                    <p className="mt-1 text-xs text-gray-500">
                      Cada tipo é a soma das suas linhas. Ao salvar, a estrutura vira padrão para
                      orçamentos futuros. Novos tipos entram como variáveis nas fórmulas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddExpenseType}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Novo tipo de gasto
                  </button>
                </div>

                {inputs.expenseTypes.map((category) => {
                  const categoryLines = inputs.lines.filter(
                    (line) => line.category === category.id
                  );
                  const total = categoryTotals[category.id] ?? 0;

                  return (
                    <div
                      key={category.id}
                      className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {category.label}
                            </h4>
                            <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                              {category.id}
                            </code>
                            <button
                              type="button"
                              onClick={() =>
                                handleRenameExpenseType(category.id, category.label)
                              }
                              className="text-[11px] text-red-600 hover:underline"
                            >
                              Renomear
                            </button>
                            {!category.builtin ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveExpenseType(category.id, category.label)
                                }
                                className="text-[11px] text-rose-600 hover:underline"
                              >
                                Remover tipo
                              </button>
                            ) : null}
                          </div>
                          <p className="text-xs tabular-nums text-gray-500">
                            Total: {formatCurrency(total)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => addLine(category.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Adicionar linha
                        </button>
                      </div>

                      {categoryLines.length === 0 ? (
                        <p className="rounded-md border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500 dark:border-gray-600">
                          Nenhuma linha em {category.label.toLowerCase()}. O total fica
                          R$&nbsp;0,00.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {categoryLines.map((line) => (
                            <div
                              key={line.id}
                              className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem_auto]"
                            >
                              <input
                                value={line.description}
                                onChange={(e) =>
                                  updateLine(line.id, { description: e.target.value })
                                }
                                placeholder="Descrição da linha"
                                className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                              />
                              <MoneyField
                                value={line.amount}
                                onChange={(amount) => updateLine(line.id, { amount })}
                              />
                              <button
                                type="button"
                                onClick={() => removeLine(line.id)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-400 hover:bg-rose-50 hover:text-rose-600"
                                title="Remover linha"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Percentuais e valores
                </h3>
                <p className="mb-3 text-xs text-gray-500">
                  Preencha R$ ou % — o outro valor é calculado automaticamente. Encargos usam o
                  total de mão de obra; custo indireto, lucro, tributo e margem usam custo direto +
                  encargos
                  {bdiComponentBase > 0 ? ` (${formatCurrency(bdiComponentBase)})` : ''}; desconto
                  simulado usa o preço-teto.
                </p>
                <div className="grid gap-3 lg:grid-cols-3">
                  <DualMoneyPercentField
                    label="Encargos sociais"
                    value={inputs.encargosSociais}
                    base={encargosBase}
                    onChange={(encargosSociais) => patchInputs({ encargosSociais })}
                    definition={ORCAMENTO_FIELD_DEFINITIONS['Encargos sociais']}
                  />
                  <DualMoneyPercentField
                    label="Margem mínima"
                    value={inputs.margemMinima}
                    base={bdiComponentBase}
                    onChange={(margemMinima) => patchInputs({ margemMinima })}
                    definition={ORCAMENTO_FIELD_DEFINITIONS['Margem mínima']}
                  />
                  <DualMoneyPercentField
                    label="Desconto simulado"
                    value={inputs.descontoSimulado}
                    base={descontoBase}
                    onChange={(descontoSimulado) => patchInputs({ descontoSimulado })}
                    definition={ORCAMENTO_FIELD_DEFINITIONS['Desconto simulado']}
                  />
                  <DualMoneyPercentField
                    label="Custo indireto"
                    value={inputs.custoIndireto}
                    base={bdiComponentBase}
                    onChange={(custoIndireto) => patchInputs({ custoIndireto })}
                    definition={ORCAMENTO_FIELD_DEFINITIONS['Custo indireto']}
                  />
                  <DualMoneyPercentField
                    label="Lucro"
                    value={inputs.lucro}
                    base={bdiComponentBase}
                    onChange={(lucro) => patchInputs({ lucro })}
                    definition={ORCAMENTO_FIELD_DEFINITIONS.Lucro}
                  />
                  <DualMoneyPercentField
                    label="Tributo"
                    value={inputs.tributo}
                    base={bdiComponentBase}
                    onChange={(tributo) => patchInputs({ tributo })}
                    definition={ORCAMENTO_FIELD_DEFINITIONS.Tributo}
                  />
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Resultado do orçamento
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {resultCards.map((card) => (
                    <div
                      key={card.label}
                      className="rounded-lg border border-gray-200 bg-gray-50/70 px-3 py-3 dark:border-gray-700 dark:bg-gray-900/40"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                          {card.label}
                        </div>
                        {card.definition ? (
                          <FieldInfoButton definition={card.definition} />
                        ) : null}
                      </div>
                      <div
                        className={`mt-1 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100 ${card.tone ?? ''}`}
                      >
                        {card.value}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">
                    Observações
                  </span>
                  <textarea
                    value={inputs.notes ?? ''}
                    onChange={(e) => patchInputs({ notes: e.target.value })}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
                    placeholder="Notas do orçamento…"
                  />
                </label>
              </section>

              <section className="rounded-lg border border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowFormulas((v) => !v)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                  aria-expanded={showFormulas}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {showFormulas ? (
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-500" />
                    )}
                    Fórmulas (editáveis)
                  </span>
                  <span className="text-xs text-gray-500">
                    {showFormulas ? 'Recolher' : 'Expandir'}
                  </span>
                </button>
                {showFormulas ? (
                  <div className="space-y-3 border-t border-gray-200 px-3 py-3 dark:border-gray-700">
                    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/80 p-3 dark:border-gray-600 dark:bg-gray-900/40">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                        Campos para montar as fórmulas
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Use os nomes técnicos abaixo nas expressões. Operadores: + − * / ( ).
                        Cada resultado pode ser referenciado nas fórmulas seguintes.
                      </p>
                      <div className="mt-3 space-y-3">
                        {formulaFieldGroups.map((group) => (
                          <div key={group.title}>
                            <p className="mb-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-400">
                              {group.title}
                            </p>
                            <ul className="grid gap-1 sm:grid-cols-2">
                              {group.fields.map((field) => (
                                <li
                                  key={field.name}
                                  className="flex min-w-0 items-baseline gap-2 rounded-md bg-white/70 px-2 py-1 dark:bg-gray-800/60"
                                >
                                  <code className="shrink-0 font-mono text-[11px] text-red-700 dark:text-red-400">
                                    {field.name}
                                  </code>
                                  <span className="truncate text-[11px] text-gray-500">
                                    {field.label}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                    {LICITACAO_ORCAMENTO_FORMULA_ORDER.map((key) => (
                      <div
                        key={key}
                        className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                      >
                        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                            {LICITACAO_ORCAMENTO_FORMULA_LABELS[key]}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs tabular-nums text-gray-500">
                              {key.includes('percent') ||
                              key === 'bdi_percent' ||
                              key === 'margem_real_simulada'
                                ? formatPercent(liveResult.formulaValues[key] ?? 0)
                                : formatCurrency(liveResult.formulaValues[key] ?? 0)}
                            </span>
                            <button
                              type="button"
                              onClick={() => resetFormula(key)}
                              className="text-xs text-red-600 hover:underline"
                            >
                              Restaurar
                            </button>
                          </div>
                        </div>
                        <textarea
                          value={inputs.formulas[key]}
                          onChange={(e) =>
                            patchInputs({
                              formulas: { ...inputs.formulas, [key]: e.target.value },
                            })
                          }
                          rows={2}
                          className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 font-mono text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        />
                        {liveResult.formulaErrors[key] ? (
                          <p className="mt-1 text-xs text-rose-600">
                            {liveResult.formulaErrors[key]}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </section>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
