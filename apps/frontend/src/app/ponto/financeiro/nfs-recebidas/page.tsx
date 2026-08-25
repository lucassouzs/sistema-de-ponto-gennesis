'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Download,
  FileText,
  Filter,
  Info,
  Search,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange
} from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
} from '@/components/ui/listTableUi';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';

/** Ano de interesse (alinhado ao NFE_AUTO_FETCH_YEAR do backend). */
const NFE_YEAR = 2026;
const PAGE_SIZE = 50;
const YEAR_FROM = `${NFE_YEAR}-01-01`;
const YEAR_TO = `${NFE_YEAR}-12-31`;

const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

type NfeItem = {
  id: string;
  chaveAcesso: string | null;
  nsu: string;
  schema?: string | null;
  numero: string | null;
  serie: string | null;
  emitCnpj: string | null;
  emitNome: string | null;
  destinatarioCnpj?: string | null;
  valor: number | null;
  dataEmissao: string | null;
  fetchedAt: string;
  hasXml?: boolean;
  isFullXml?: boolean;
  xmlFileName?: string | null;
};

type NfeDetalheItem = {
  nItem: number;
  codigo: string | null;
  descricao: string | null;
  ncm: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
};

type NfeDetalhe = NfeItem & {
  naturezaOperacao: string | null;
  emitFantasia: string | null;
  emitIe: string | null;
  emitEndereco: string | null;
  destNome: string | null;
  destIe: string | null;
  destEndereco: string | null;
  totais: {
    vProd: number | null;
    vFrete: number | null;
    vSeg: number | null;
    vDesc: number | null;
    vOutro: number | null;
    vICMS: number | null;
    vIPI: number | null;
    vPIS: number | null;
    vCOFINS: number | null;
    vNF: number | null;
  };
  itens: NfeDetalheItem[];
  aviso: string | null;
};

type NfeListResponse = {
  items: NfeItem[];
  total: number;
  totalAno?: number;
  totalOutros?: number;
  page: number;
  pageSize: number;
  ultimoNsu: string;
  lastFetchAt: string | null;
  lastMessage: string | null;
};

function formatMoney(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function formatCnpj(value: string | null | undefined) {
  if (!value) return '—';
  const d = value.replace(/\D/g, '');
  if (d.length !== 14) return value;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatChaveGrouped(chave: string | null | undefined) {
  if (!chave) return '—';
  const d = chave.replace(/\D/g, '');
  if (!d) return '—';
  return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatNfNumero(item: Pick<NfeItem, 'numero' | 'serie'>) {
  if (!item.numero) return '—';
  return item.serie ? `${item.numero}/${item.serie}` : item.numero;
}

function nfeXmlTipoLabel(item: NfeItem): { label: string; className: string } {
  if (item.isFullXml) {
    return {
      label: 'Completa',
      className:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    };
  }
  const schema = (item.schema || '').toLowerCase();
  if (schema.includes('resnfe') || schema.includes('res')) {
    return {
      label: 'Resumo',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    };
  }
  if (schema.includes('procnfe') || schema.includes('nfeproc')) {
    return {
      label: 'Completa',
      className:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
    };
  }
  return {
    label: item.hasXml ? 'XML' : '—',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  };
}

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatQty(value: number | null) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </h3>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function DetailField({
  label,
  children,
  className = '',
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  );
}

async function downloadNfeDanfe(item: NfeItem) {
  const res = await api.get(`/nfe-recebidas/${item.id}/danfe`, {
    responseType: 'blob',
    timeout: 180_000,
  });
  const blob = res.data as Blob;
  // Erro JSON veio como blob
  if (blob.type?.includes('json') || blob.size < 500) {
    const text = await blob.text();
    try {
      const parsed = JSON.parse(text) as { message?: string; error?: string };
      throw new Error(parsed.message || parsed.error || 'Falha ao gerar DANFE');
    } catch (e) {
      if (e instanceof Error && e.message !== 'Falha ao gerar DANFE' && !e.message.startsWith('Unexpected')) {
        throw e;
      }
      if (blob.size < 500) throw new Error(text.slice(0, 200) || 'Falha ao gerar DANFE');
    }
  }
  const chave = (item.chaveAcesso || '').replace(/\D/g, '');
  const name = chave
    ? `DANFE-${chave}.pdf`
    : `DANFE-${item.numero || item.id}.pdf`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const ACTIONS_COL_TH =
  'w-[5%] min-w-[3.75rem] whitespace-nowrap px-2 py-3 text-center align-middle text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-3 sm:py-4';
const ACTIONS_COL_TD =
  'w-[5%] min-w-[3.75rem] whitespace-nowrap px-2 py-3 text-center align-middle sm:px-3';

type StatusBuscaInfo = {
  kind: 'blocked' | 'ok';
  title: string;
  detail?: string;
  waitHint?: string;
  nsu?: string;
  novas: number | null;
  totalAno: number;
  totalOutros: number;
  year: number;
  lastFetchLabel?: string;
  nextFetchLabel?: string;
};

/** Alinhado ao SEFAZ_COOLDOWN_MS do backend (65 min). */
const SEFAZ_COOLDOWN_MS = 65 * 60 * 1000;

function formatDateTimeBr(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function fetchScheduleLabels(lastFetchAt: string | null | undefined): {
  lastFetchLabel?: string;
  nextFetchLabel?: string;
  waitHintFromCooldown?: string;
} {
  if (!lastFetchAt) return {};
  const last = new Date(lastFetchAt);
  if (Number.isNaN(last.getTime())) return {};

  const next = new Date(last.getTime() + SEFAZ_COOLDOWN_MS);
  const remainingMs = next.getTime() - Date.now();
  const lastFetchLabel = formatDateTimeBr(last);
  if (remainingMs <= 0) {
    return {
      lastFetchLabel,
      nextFetchLabel: 'Assim que o agendador rodar',
    };
  }
  const waitMin = Math.max(1, Math.ceil(remainingMs / 60_000));
  return {
    lastFetchLabel,
    nextFetchLabel: formatDateTimeBr(next),
    waitHintFromCooldown: `Próxima tentativa em cerca de ${waitMin} min`,
  };
}

function statusBuscaVisivel(
  msg: string | null | undefined,
  totalAno: number,
  totalOutros: number,
  year: number,
  lastFetchAt?: string | null
): StatusBuscaInfo | null {
  if (!msg && !lastFetchAt) return null;
  if (msg && /reimporta/i.test(msg)) return null;

  const schedule = fetchScheduleLabels(lastFetchAt);
  const nsuMatch = msg?.match(/Último NSU:\s*([0-9]+)/i);
  const nsu = nsuMatch?.[1];

  if (msg && /consumo indevido|bloquead/i.test(msg)) {
    return {
      kind: 'blocked',
      title: 'Consulta temporariamente pausada',
      detail:
        'A SEFAZ limitou novas consultas deste CNPJ por excesso de requisições. A atualização automática volta sozinha após o intervalo.',
      waitHint: schedule.waitHintFromCooldown || 'Aguardando liberação da SEFAZ',
      nsu,
      novas: null,
      totalAno,
      totalOutros,
      year,
      lastFetchLabel: schedule.lastFetchLabel,
      nextFetchLabel: schedule.nextFetchLabel,
    };
  }

  if (!msg) {
    return {
      kind: 'ok',
      title: 'Atualização automática',
      detail: 'Busca automática na SEFAZ (a cada hora, quando permitido).',
      nsu,
      novas: null,
      totalAno,
      totalOutros,
      year,
      lastFetchLabel: schedule.lastFetchLabel,
      nextFetchLabel: schedule.nextFetchLabel,
    };
  }

  const novasMatch = msg.match(/(\d+)\s*nota[s]?\s+nova/i) || msg.match(/(\d+)\s*nova/);
  const novas = /nenhuma nota nova/i.test(msg)
    ? 0
    : novasMatch
      ? Number(novasMatch[1])
      : null;

  const title =
    novas == null
      ? 'Última atualização automática'
      : novas === 0
        ? 'Nenhuma nota nova'
        : novas === 1
          ? '1 nota nova encontrada'
          : `${novas} notas novas encontradas`;

  return {
    kind: 'ok',
    title,
    detail: 'Busca automática na SEFAZ (a cada hora, quando permitido).',
    nsu,
    novas,
    totalAno,
    totalOutros,
    year,
    lastFetchLabel: schedule.lastFetchLabel,
    nextFetchLabel: schedule.nextFetchLabel,
  };
}

function StatusBuscaTooltip({ info }: { info: StatusBuscaInfo }) {
  const isBlocked = info.kind === 'blocked';
  return (
    <span
      id="nfe-sefaz-status-hint"
      role="tooltip"
      className={`pointer-events-none absolute left-0 top-full z-30 mt-2 w-[min(19.5rem,calc(100vw-2rem))] rounded-xl border px-3.5 py-3 text-left shadow-xl transition-opacity duration-150 invisible opacity-0 group-hover/sefaz-info:visible group-hover/sefaz-info:opacity-100 group-focus-within/sefaz-info:visible group-focus-within/sefaz-info:opacity-100 ${
        isBlocked
          ? 'border-amber-200 bg-amber-50 dark:border-amber-800/70 dark:bg-amber-950/95'
          : 'border-gray-200 bg-white dark:border-gray-600 dark:bg-gray-800'
      }`}
    >
      <span className="block space-y-2">
        <span className="block">
          <span
            className={`block text-sm font-semibold leading-snug ${
              isBlocked
                ? 'text-amber-900 dark:text-amber-100'
                : 'text-gray-900 dark:text-gray-100'
            }`}
          >
            {info.title}
          </span>
          {info.detail ? (
            <span
              className={`mt-1 block text-xs leading-relaxed ${
                isBlocked
                  ? 'text-amber-800/90 dark:text-amber-200/85'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            >
              {info.detail}
            </span>
          ) : null}
        </span>

        {info.waitHint ? (
          <span
            className={`inline-flex rounded-md px-2 py-1 text-[11px] font-semibold tracking-wide ${
              isBlocked
                ? 'bg-amber-200/70 text-amber-900 dark:bg-amber-900/70 dark:text-amber-100'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
            }`}
          >
            {info.waitHint}
          </span>
        ) : null}

        <span
          className={`block space-y-1.5 border-t pt-2 text-[11px] leading-relaxed ${
            isBlocked
              ? 'border-amber-200/80 text-amber-900/80 dark:border-amber-800/60 dark:text-amber-100/75'
              : 'border-gray-100 text-gray-600 dark:border-gray-700 dark:text-gray-400'
          }`}
        >
          {info.lastFetchLabel ? (
            <span className="flex justify-between gap-3">
              <span className="font-medium opacity-80">Última busca</span>
              <span className="text-right tabular-nums font-semibold text-current">
                {info.lastFetchLabel}
              </span>
            </span>
          ) : null}
          {info.nextFetchLabel ? (
            <span className="flex justify-between gap-3">
              <span className="font-medium opacity-80">Próxima</span>
              <span className="text-right tabular-nums font-semibold text-current">
                {info.nextFetchLabel}
              </span>
            </span>
          ) : null}
          <span className="flex justify-between gap-3">
            <span className="font-medium opacity-80">{info.year}</span>
            <span className="tabular-nums font-semibold text-current">
              {info.totalAno} nota(s)
            </span>
          </span>
          <span className="flex justify-between gap-3">
            <span className="font-medium opacity-80">Outros períodos</span>
            <span className="tabular-nums font-semibold text-current">
              {info.totalOutros} nota(s)
            </span>
          </span>
          {info.nsu ? (
            <span className="flex justify-between gap-3">
              <span className="font-medium opacity-80">Último NSU</span>
              <span className="truncate font-mono text-[10px] tabular-nums">{info.nsu}</span>
            </span>
          ) : null}
        </span>
      </span>
    </span>
  );
}

export default function NfsRecebidasPage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterPeriodFrom, setFilterPeriodFrom] = useState(YEAR_FROM);
  const [filterPeriodTo, setFilterPeriodTo] = useState(YEAR_TO);
  const [draftFrom, setDraftFrom] = useState(YEAR_FROM);
  const [draftTo, setDraftTo] = useState(YEAR_TO);
  const [filterEmitentes, setFilterEmitentes] = useState<string[]>([]);
  const [draftEmitentes, setDraftEmitentes] = useState<string[]>([]);
  const [detailNfe, setDetailNfe] = useState<NfeItem | null>(null);
  const [listaScope, setListaScope] = useState<'ano' | 'outros'>('ano');
  const [draftListaScope, setDraftListaScope] = useState<'ano' | 'outros'>('ano');

  const { data: nfeDetalhe, isLoading: loadingDetalhe } = useQuery({
    queryKey: ['nfe-recebida-detalhe', detailNfe?.id],
    queryFn: async () => {
      const res = await api.get(`/nfe-recebidas/${detailNfe!.id}/detalhe`, {
        timeout: 180_000,
      });
      return res.data?.data as NfeDetalhe;
    },
    enabled: Boolean(detailNfe?.id),
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const listPeriod = useMemo(
    () => ({
      periodFrom: filterPeriodFrom || YEAR_FROM,
      periodTo: filterPeriodTo || YEAR_TO
    }),
    [filterPeriodFrom, filterPeriodTo]
  );

  useEffect(() => {
    setPage(1);
  }, [search, filterPeriodFrom, filterPeriodTo, filterEmitentes, listaScope]);

  const { data: emitentesData } = useQuery({
    queryKey: ['nfe-recebidas-emitentes'],
    queryFn: async () => {
      const res = await api.get('/nfe-recebidas/emitentes', { timeout: 60_000 });
      return (res.data?.data ?? []) as Array<{ cnpj: string; nome: string }>;
    },
    staleTime: 5 * 60_000,
  });

  const emitenteOptions = useMemo(() => {
    return (emitentesData ?? []).map((e) => {
      const cnpjFmt = formatCnpj(e.cnpj);
      const nome = (e.nome || '').trim() || (cnpjFmt !== '—' ? cnpjFmt : 'Emitente sem nome');
      return {
        value: e.cnpj || e.nome,
        label: nome,
        description: cnpjFmt !== '—' ? cnpjFmt : undefined,
        searchText: `${nome} ${e.cnpj} ${cnpjFmt}`,
        triggerLabel: nome,
      };
    });
  }, [emitentesData]);

  const openFilters = () => {
    setDraftEmitentes(filterEmitentes);
    setDraftFrom(filterPeriodFrom);
    setDraftTo(filterPeriodTo);
    setDraftListaScope(listaScope);
    setFiltersOpen(true);
  };

  const clearFilters = () => {
    setDraftEmitentes([]);
    setDraftFrom(YEAR_FROM);
    setDraftTo(YEAR_TO);
    setDraftListaScope('ano');
  };

  const applyFilters = () => {
    if (draftListaScope !== 'outros' && draftFrom && draftTo && draftFrom > draftTo) {
      toast.error('A data inicial não pode ser maior que a final.');
      return;
    }
    setFilterEmitentes(draftEmitentes);
    setFilterPeriodFrom(draftFrom || YEAR_FROM);
    setFilterPeriodTo(draftTo || YEAR_TO);
    setListaScope(draftListaScope);
    setPage(1);
    setFiltersOpen(false);
  };

  const { data, isLoading } = useQuery({
    queryKey: [
      'nfe-recebidas',
      listaScope,
      search,
      filterEmitentes,
      listPeriod.periodFrom,
      listPeriod.periodTo,
      page,
    ],
    queryFn: async () => {
      const res = await api.get('/nfe-recebidas', {
        params: {
          q: search || undefined,
          emitente:
            filterEmitentes.length > 0 ? filterEmitentes.join(',') : undefined,
          ...(listaScope === 'outros'
            ? { scope: 'outros' }
            : {
                periodFrom: listPeriod.periodFrom,
                periodTo: listPeriod.periodTo,
              }),
          page,
          pageSize: PAGE_SIZE
        },
        timeout: 120_000
      });
      return res.data?.data as NfeListResponse;
    },
    // Notas entram via busca automática no backend; atualiza a lista sem botão manual.
    refetchInterval: 2 * 60_000,
    refetchOnWindowFocus: true,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const listRange = getCadastroListRange(page, PAGE_SIZE, total);
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const statusMsg = statusBuscaVisivel(
    data?.lastMessage,
    data?.totalAno ?? (listaScope === 'ano' ? total : 0),
    data?.totalOutros ?? (listaScope === 'outros' ? total : 0),
    NFE_YEAR,
    data?.lastFetchAt
  );
  const hasActiveSearch = Boolean(search.trim());
  const hasActiveEmitente = filterEmitentes.length > 0;
  const viewingOutros = listaScope === 'outros';
  const hasCustomPeriod =
    filterPeriodFrom !== YEAR_FROM || filterPeriodTo !== YEAR_TO;
  // Escopo "outros" também marca filtro ativo (badge), mas não estreita o tipo de listaScope.
  const hasActiveFilters =
    hasActiveSearch || hasActiveEmitente || viewingOutros || hasCustomPeriod;
  const emptyIsFiltered = hasActiveSearch || hasActiveEmitente || hasCustomPeriod;

  const listSubtitle = useMemo(() => {
    if (isLoading && !data) {
      return listaScope === 'outros' ? 'Carregando notas de outros períodos…' : 'Carregando notas…';
    }
    if (listaScope === 'outros') {
      const base =
        total === 1
          ? `1 nota fora de ${NFE_YEAR}`
          : `${total} nota(s) fora de ${NFE_YEAR}`;
      return hasActiveFilters ? `${base} · filtrados` : base;
    }
    const base =
      total === 1
        ? `1 nota em ${NFE_YEAR}`
        : `${total} nota(s) em ${NFE_YEAR}`;
    return hasActiveFilters ? `${base} · filtrados` : base;
  }, [data, isLoading, total, hasActiveFilters, listaScope]);

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/financeiro/nfs-recebidas">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/financeiro/nfs-recebidas">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Entrada Fiscal
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Consulte e acompanhe as notas fiscais da empresa.
            </p>
          </div>

          <Modal
            isOpen={filtersOpen}
            onClose={() => setFiltersOpen(false)}
            title="Filtros"
            size="md"
            confirmBeforeClose={false}
          >
            <div className="space-y-4">
              <div>
                <label className={labelClass} htmlFor="nfe-filter-emitente">
                  Emitente
                </label>
                <MultiSelectSearchDropdown
                  selected={draftEmitentes}
                  onChange={setDraftEmitentes}
                  options={emitenteOptions}
                  placeholder="Todos os emitentes"
                  searchPlaceholder="Buscar por nome ou CNPJ…"
                  emptyOptionsMessage="Nenhum emitente carregado."
                  emptySearchMessage="Nenhum emitente encontrado."
                  noFocusRing
                />
              </div>
              <div>
                <span className={labelClass}>Lista</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftListaScope('ano')}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      draftListaScope === 'ano'
                        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    {NFE_YEAR}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftListaScope('outros')}
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      draftListaScope === 'outros'
                        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    Outros períodos
                  </button>
                </div>
                {draftListaScope === 'outros' ? (
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    Mostra notas com emissão fora de {NFE_YEAR} (ou sem data).
                  </p>
                ) : null}
              </div>
              <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${draftListaScope === 'outros' ? 'pointer-events-none opacity-50' : ''}`}>
                <div>
                  <label className={labelClass}>Emissão de</label>
                  <DatePickerField
                    value={draftFrom}
                    onChange={setDraftFrom}
                    aria-label="Data inicial de emissão"
                  />
                </div>
                <div>
                  <label className={labelClass}>Emissão até</label>
                  <DatePickerField
                    value={draftTo}
                    onChange={setDraftTo}
                    aria-label="Data final de emissão"
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={applyFilters}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </Modal>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <FileText className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Entrada Fiscal
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{listSubtitle}</p>
                  </div>
                </div>

                <div className={cadastroListClasses.cardToolbar}>
                  {statusMsg ? (
                    <span className="group/sefaz-info relative shrink-0">
                      <button
                        type="button"
                        aria-label="Status da última consulta SEFAZ"
                        aria-describedby="nfe-sefaz-status-hint"
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                          statusMsg.kind === 'blocked'
                            ? 'text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:text-amber-400 dark:hover:bg-amber-950/40 dark:hover:text-amber-300'
                            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200'
                        }`}
                      >
                        {statusMsg.kind === 'blocked' ? (
                          <AlertTriangle className="h-4 w-4" aria-hidden />
                        ) : (
                          <Info className="h-4 w-4" aria-hidden />
                        )}
                      </button>
                      <StatusBuscaTooltip info={statusMsg} />
                    </span>
                  ) : null}

                  <div className={cadastroListClasses.searchField}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          setSearch(q.trim());
                          setPage(1);
                        }
                      }}
                      placeholder="Buscar emitente, CNPJ, número ou chave…"
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {q ? (
                      <button
                        type="button"
                        onClick={() => {
                          setQ('');
                          setSearch('');
                          setPage(1);
                        }}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={openFilters}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasActiveFilters
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtros"
                    title={hasActiveFilters ? 'Filtro ativo' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilters ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className={cadastroListClasses.cardContent}>
              {isLoading ? (
                <CadastroListLoading message="Carregando notas…" />
              ) : items.length === 0 ? (
                <CadastroListEmpty
                  icon={FileText}
                  title={
                    emptyIsFiltered
                      ? 'Nenhum resultado encontrado'
                      : viewingOutros
                        ? `Nenhuma nota fora de ${NFE_YEAR}`
                        : `Nenhuma nota de ${NFE_YEAR} ainda`
                  }
                  hint={
                    emptyIsFiltered
                      ? 'Ajuste a busca ou o período e tente novamente.'
                      : viewingOutros
                        ? 'Aqui aparecem as notas que a SEFAZ enviou com emissão fora do ano atual.'
                        : 'As notas novas entram automaticamente a cada hora, quando a SEFAZ permitir.'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={listRange.startItem}
                    endItem={listRange.endItem}
                    total={total}
                    itemLabel="nota"
                    itemLabelPlural="notas"
                    currentPage={page}
                    totalPages={listRange.totalPages}
                  />
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={`${cadastroListClasses.table} !min-w-[56rem]`}>
                      <colgroup>
                        <col className="w-[7.5rem]" />
                        <col />
                        <col className="w-[9.5rem]" />
                        <col className="w-[8.5rem]" />
                        <col className="w-[5.5rem]" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700">
                          <th className={cadastroListClasses.thNumeric}>Número</th>
                          <th className={cadastroListClasses.th}>Emitente</th>
                          <th
                            className={`${cadastroListClasses.thCenter} !px-3 sm:!px-3`}
                          >
                            Emissão
                          </th>
                          <th className={cadastroListClasses.thNumeric}>Valor</th>
                          <th className={ACTIONS_COL_TH}>Arquivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {items.map((item) => {
                          const chave = item.chaveAcesso?.replace(/\D/g, '') || '';
                          const hasXml = Boolean(item.hasXml);
                          const emitenteTitle = [item.emitNome, formatCnpj(item.emitCnpj)]
                            .filter((v) => v && v !== '—')
                            .join(' · ');
                          return (
                            <tr
                              key={item.id}
                              className={getListTableRowClassName(true)}
                              onClick={() => setDetailNfe(item)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setDetailNfe(item);
                                }
                              }}
                              tabIndex={0}
                              role="button"
                              aria-label={`Abrir detalhes da NF ${formatNfNumero(item)}`}
                            >
                              <td
                                className={`${cadastroListClasses.tdNumeric} font-mono font-medium tabular-nums text-gray-900 dark:text-gray-100`}
                              >
                                {formatNfNumero(item)}
                              </td>
                              <td className={`${cadastroListClasses.td} max-w-[280px]`}>
                                <div className="min-w-0" title={emitenteTitle || undefined}>
                                  <ListRowNavigableLabel className="block truncate font-medium">
                                    {item.emitNome || '—'}
                                  </ListRowNavigableLabel>
                                  <p className="mt-0.5 truncate font-mono text-xs tabular-nums text-gray-500 dark:text-gray-400">
                                    {formatCnpj(item.emitCnpj)}
                                  </p>
                                </div>
                              </td>
                              <td className={`${cadastroListClasses.tdCenter} !px-3 sm:!px-3`}>
                                <span className="inline-block tabular-nums">
                                  {formatDate(item.dataEmissao)}
                                </span>
                              </td>
                              <td className={cadastroListClasses.tdNumeric}>
                                {formatMoney(item.valor)}
                              </td>
                              <td className={ACTIONS_COL_TD}>
                                <div
                                  className="flex justify-center"
                                  onClick={(e) => e.stopPropagation()}
                                  onKeyDown={(e) => e.stopPropagation()}
                                >
                                  {hasXml ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const toastId = toast.loading('Gerando DANFE…');
                                        void downloadNfeDanfe(item)
                                          .then(() => {
                                            toast.success('DANFE baixado.', { id: toastId });
                                          })
                                          .catch((err: unknown) => {
                                            const msg =
                                              err &&
                                              typeof err === 'object' &&
                                              'response' in err &&
                                              (err as { response?: { data?: Blob } }).response?.data
                                                instanceof Blob
                                                ? null
                                                : err instanceof Error
                                                  ? err.message
                                                  : null;
                                            void (async () => {
                                              let detail = msg;
                                              const data = (
                                                err as { response?: { data?: Blob } }
                                              )?.response?.data;
                                              if (!detail && data instanceof Blob) {
                                                try {
                                                  const t = await data.text();
                                                  const j = JSON.parse(t) as {
                                                    message?: string;
                                                    error?: string;
                                                  };
                                                  detail = j.message || j.error || t.slice(0, 180);
                                                } catch {
                                                  detail = 'Não foi possível gerar o DANFE.';
                                                }
                                              }
                                              toast.error(
                                                detail || 'Não foi possível gerar o DANFE.',
                                                { id: toastId }
                                              );
                                            })();
                                          });
                                      }}
                                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                                      aria-label={`Baixar DANFE da NF ${item.numero || chave}`}
                                      title="Baixar DANFE (PDF)"
                                    >
                                      <Download className="h-4 w-4" aria-hidden />
                                    </button>
                                  ) : (
                                    <span
                                      className="inline-flex h-8 w-8 items-center justify-center text-gray-300 dark:text-gray-600"
                                      title="XML não encontrado no servidor"
                                    >
                                      —
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <ListPagination
                    currentPage={page}
                    totalPages={listRange.totalPages}
                    onPageChange={setPage}
                  />
                </>
              )}
            </CardContent>
          </Card>

          <Modal
            isOpen={Boolean(detailNfe)}
            onClose={() => setDetailNfe(null)}
            title={
              detailNfe
                ? `NF-e ${formatNfNumero(detailNfe)}`
                : 'Detalhes da NF-e'
            }
            size="xl"
          >
            {detailNfe && (
              <div className="space-y-6">
                {loadingDetalhe ? (
                  <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    Carregando detalhes… Se só houver resumo, pode consultar a SEFAZ pela chave.
                  </p>
                ) : (
                  <>
                    {nfeDetalhe?.aviso ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
                        {nfeDetalhe.aviso}
                      </div>
                    ) : null}

                    <DetailSection title="Identificação">
                      <DetailField label="Número">
                        {nfeDetalhe?.numero || detailNfe.numero || '—'}
                      </DetailField>
                      <DetailField label="Série">
                        {nfeDetalhe?.serie || detailNfe.serie || '—'}
                      </DetailField>
                      <DetailField label="NSU">
                        <span className="font-mono tabular-nums">
                          {nfeDetalhe?.nsu || detailNfe.nsu || '—'}
                        </span>
                      </DetailField>
                      <DetailField label="Tipo XML">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${nfeXmlTipoLabel(nfeDetalhe || detailNfe).className}`}
                        >
                          {nfeXmlTipoLabel(nfeDetalhe || detailNfe).label}
                        </span>
                      </DetailField>
                      <DetailField label="Natureza da operação" className="sm:col-span-2">
                        {nfeDetalhe?.naturezaOperacao || '—'}
                      </DetailField>
                      <DetailField label="Chave de acesso" className="sm:col-span-2">
                        <span className="break-all font-mono text-xs tabular-nums leading-relaxed">
                          {formatChaveGrouped(
                            nfeDetalhe?.chaveAcesso || detailNfe.chaveAcesso
                          )}
                        </span>
                      </DetailField>
                    </DetailSection>

                    <DetailSection title="Emitente">
                      <DetailField label="Nome" className="sm:col-span-2">
                        {nfeDetalhe?.emitNome || detailNfe.emitNome || '—'}
                      </DetailField>
                      <DetailField label="Nome fantasia">
                        {nfeDetalhe?.emitFantasia || '—'}
                      </DetailField>
                      <DetailField label="IE">{nfeDetalhe?.emitIe || '—'}</DetailField>
                      <DetailField label="CNPJ">
                        <span className="font-mono tabular-nums">
                          {formatCnpj(nfeDetalhe?.emitCnpj || detailNfe.emitCnpj)}
                        </span>
                      </DetailField>
                      <DetailField label="Endereço" className="sm:col-span-2">
                        {nfeDetalhe?.emitEndereco || '—'}
                      </DetailField>
                    </DetailSection>

                    <DetailSection title="Destinatário">
                      <DetailField label="Nome" className="sm:col-span-2">
                        {nfeDetalhe?.destNome || '—'}
                      </DetailField>
                      <DetailField label="CNPJ/CPF">
                        <span className="font-mono tabular-nums">
                          {formatCnpj(
                            nfeDetalhe?.destinatarioCnpj || detailNfe.destinatarioCnpj
                          )}
                        </span>
                      </DetailField>
                      <DetailField label="IE">{nfeDetalhe?.destIe || '—'}</DetailField>
                      <DetailField label="Endereço" className="sm:col-span-2">
                        {nfeDetalhe?.destEndereco || '—'}
                      </DetailField>
                    </DetailSection>

                    <DetailSection title="Totais">
                      <DetailField label="Produtos">
                        <span className="tabular-nums">
                          {formatMoney(nfeDetalhe?.totais.vProd ?? null)}
                        </span>
                      </DetailField>
                      <DetailField label="Frete">
                        <span className="tabular-nums">
                          {formatMoney(nfeDetalhe?.totais.vFrete ?? null)}
                        </span>
                      </DetailField>
                      <DetailField label="Desconto">
                        <span className="tabular-nums">
                          {formatMoney(nfeDetalhe?.totais.vDesc ?? null)}
                        </span>
                      </DetailField>
                      <DetailField label="Outros">
                        <span className="tabular-nums">
                          {formatMoney(nfeDetalhe?.totais.vOutro ?? null)}
                        </span>
                      </DetailField>
                      <DetailField label="ICMS">
                        <span className="tabular-nums">
                          {formatMoney(nfeDetalhe?.totais.vICMS ?? null)}
                        </span>
                      </DetailField>
                      <DetailField label="IPI">
                        <span className="tabular-nums">
                          {formatMoney(nfeDetalhe?.totais.vIPI ?? null)}
                        </span>
                      </DetailField>
                      <DetailField label="PIS">
                        <span className="tabular-nums">
                          {formatMoney(nfeDetalhe?.totais.vPIS ?? null)}
                        </span>
                      </DetailField>
                      <DetailField label="COFINS">
                        <span className="tabular-nums">
                          {formatMoney(nfeDetalhe?.totais.vCOFINS ?? null)}
                        </span>
                      </DetailField>
                      <DetailField label="Valor da NF">
                        <span className="font-medium tabular-nums">
                          {formatMoney(
                            nfeDetalhe?.totais.vNF ??
                              nfeDetalhe?.valor ??
                              detailNfe.valor
                          )}
                        </span>
                      </DetailField>
                      <DetailField label="Emissão">
                        {formatDate(nfeDetalhe?.dataEmissao || detailNfe.dataEmissao)}
                      </DetailField>
                      <DetailField label="Recebida em">
                        {formatDateTime(nfeDetalhe?.fetchedAt || detailNfe.fetchedAt)}
                      </DetailField>
                    </DetailSection>

                    <section className="space-y-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Itens
                        {nfeDetalhe?.itens?.length
                          ? ` (${nfeDetalhe.itens.length})`
                          : ''}
                      </h3>
                      {nfeDetalhe?.itens && nfeDetalhe.itens.length > 0 ? (
                        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                          <table className="w-full min-w-[40rem] text-left text-sm">
                            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-400">
                              <tr>
                                <th className="px-3 py-2 text-right">#</th>
                                <th className="px-3 py-2">Código</th>
                                <th className="px-3 py-2">Descrição</th>
                                <th className="px-3 py-2">NCM</th>
                                <th className="px-3 py-2">CFOP</th>
                                <th className="px-3 py-2 text-right">Qtd</th>
                                <th className="px-3 py-2">UN</th>
                                <th className="px-3 py-2 text-right">Unit.</th>
                                <th className="px-3 py-2 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                              {nfeDetalhe.itens.map((it) => (
                                <tr key={it.nItem}>
                                  <td className="px-3 py-2 text-right tabular-nums text-gray-600 dark:text-gray-400">
                                    {it.nItem}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-xs">
                                    {it.codigo || '—'}
                                  </td>
                                  <td className="max-w-[16rem] px-3 py-2">
                                    <span className="line-clamp-2" title={it.descricao || undefined}>
                                      {it.descricao || '—'}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 font-mono text-xs tabular-nums">
                                    {it.ncm || '—'}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-xs tabular-nums">
                                    {it.cfop || '—'}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {formatQty(it.quantidade)}
                                  </td>
                                  <td className="px-3 py-2">{it.unidade || '—'}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {formatMoney(it.valorUnitario)}
                                  </td>
                                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                                    {formatMoney(it.valorTotal)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Nenhum item disponível neste XML.
                        </p>
                      )}
                    </section>

                    {(nfeDetalhe?.hasXml ?? detailNfe.hasXml) && (
                      <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                        <button
                          type="button"
                          onClick={() => {
                            const toastId = toast.loading('Gerando DANFE…');
                            void downloadNfeDanfe(detailNfe)
                              .then(() => {
                                toast.success('DANFE baixado.', { id: toastId });
                              })
                              .catch((err: unknown) => {
                                toast.error(
                                  err instanceof Error
                                    ? err.message
                                    : 'Não foi possível gerar o DANFE.',
                                  { id: toastId }
                                );
                              });
                          }}
                          className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700"
                        >
                          <Download className="h-4 w-4" aria-hidden />
                          Baixar DANFE
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </Modal>
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
