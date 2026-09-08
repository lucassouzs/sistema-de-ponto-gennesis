import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import {
  Search,
  X,
  Send,
  ThumbsDown,
  ExternalLink,
  ClipboardList,
  MapPin,
  Building2,
  Calendar,
  Filter,
  RotateCcw,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';
import AppHeader from '../components/AppHeader';
import DateField from '../components/DateField';
import { usePermissions } from '../hooks/usePermissions';

type StatusFiltro = 'disponivel' | 'enviada' | 'rejeitada' | 'vencida' | 'all';
type ValorFiltroModo = '' | 'gt' | 'lt' | 'between';

type PncpItem = {
  sequencialCompra: number | null;
  numeroControlePNCP: string | null;
  processo: string | null;
  numeroCompra?: string | null;
  objeto: string | null;
  orgao: string | null;
  uf: string | null;
  municipio: string | null;
  modalidade: string | null;
  situacao: string | null;
  valorEstimado: number | null;
  dataAberturaProposta: string | null;
  dataEncerramentoProposta: string | null;
  linkSistemaOrigem: string | null;
  linkPncp: string | null;
  enviadoAnalise?: boolean;
  enviadoAnaliseRegiaoKey?: string | null;
  enviadoAnaliseAt?: string | null;
  enviadoAnaliseByName?: string | null;
  rejeitadoAnalise?: boolean;
  rejeitadoAnaliseAt?: string | null;
  rejeitadoAnaliseByName?: string | null;
};

type PncpListResult = {
  items: PncpItem[];
  pagina: number;
  tamanhoPagina: number;
  totalRegistros: number | null;
  totalPaginas: number | null;
  empty: boolean;
  statusCounts?: {
    all: number;
    disponivel: number;
    enviada: number;
    rejeitada: number;
    vencida: number;
  };
};

type AppliedFilters = {
  ufs: string[];
  modalidadeCodigos: string[];
  dataInicial: string;
  dataFinal: string;
  valorMin: number | null;
  valorMax: number | null;
  statusAnalise: StatusFiltro;
  q: string;
  pagina: number;
};

const BRASIL_UFS = [
  'DF', 'GO', 'SP',
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'ES', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SE', 'TO',
] as const;

const MODALIDADE_OPTIONS = [
  { codigo: '6', nome: 'Pregão Eletrônico' },
  { codigo: '8', nome: 'Dispensa de Licitação' },
  { codigo: '9', nome: 'Inexigibilidade' },
  { codigo: '4', nome: 'Concorrência Eletrônica' },
  { codigo: '5', nome: 'Concorrência' },
  { codigo: '7', nome: 'Pregão Presencial' },
  { codigo: '1', nome: 'Leilão Eletrônico' },
] as const;

const VALOR_MODO_OPTIONS: { value: ValorFiltroModo; label: string }[] = [
  { value: '', label: 'Qualquer valor' },
  { value: 'gt', label: 'Maior que' },
  { value: 'lt', label: 'Menor que' },
  { value: 'between', label: 'Entre' },
];

const MIN_SEARCH_LEN = 3;
const currencyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toYyyymmdd(value: string) {
  return value.replace(/-/g, '');
}

function defaultRange() {
  const end = new Date();
  const start = new Date();
  start.setMonth(start.getMonth() - 1);
  return { dataInicial: toYmd(start), dataFinal: toYmd(end) };
}

function maskCurrencyOrEmpty(raw: string) {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return currencyFmt.format(parseInt(digits, 10) / 100);
}

function parseCurrencyBr(value: string): number | null {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return parseInt(digits, 10) / 100;
}

function resolveValorBounds(
  modo: ValorFiltroModo,
  valor: string,
  valorDe: string,
  valorAte: string,
): { valorMin: number | null; valorMax: number | null } {
  if (modo === 'gt') return { valorMin: parseCurrencyBr(valor), valorMax: null };
  if (modo === 'lt') return { valorMin: null, valorMax: parseCurrencyBr(valor) };
  if (modo === 'between') {
    return { valorMin: parseCurrencyBr(valorDe), valorMax: parseCurrencyBr(valorAte) };
  }
  return { valorMin: null, valorMax: null };
}

function formatMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDateLabel(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildPncpEditalUrl(numeroControlePNCP: string | null | undefined): string | null {
  const m = String(numeroControlePNCP || '')
    .trim()
    .match(/^(\d{14})-\d+-(\d+)\s*\/\s*(\d{4})$/);
  if (!m) return null;
  const [, cnpj, seq, ano] = m;
  return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`;
}

function formatUfLabel(ufs: string[]) {
  if (ufs.length === 0 || ufs.length === BRASIL_UFS.length) return 'Todas as UFs';
  if (ufs.length === 1) return ufs[0];
  if (ufs.length <= 3) return ufs.join(', ');
  return `${ufs.length} UFs`;
}

function formatModalidadeLabel(codigos: string[]) {
  if (codigos.length === 0 || codigos.length === MODALIDADE_OPTIONS.length) {
    return 'Todas as modalidades';
  }
  if (codigos.length === 1) {
    return MODALIDADE_OPTIONS.find((m) => m.codigo === codigos[0])?.nome ?? codigos[0];
  }
  return `${codigos.length} modalidades`;
}

function itemStatus(row: PncpItem): Exclude<StatusFiltro, 'all'> {
  if (row.enviadoAnalise) return 'enviada';
  if (row.rejeitadoAnalise) return 'rejeitada';
  if (row.dataEncerramentoProposta) {
    const d = new Date(row.dataEncerramentoProposta);
    if (!Number.isNaN(d.getTime()) && d.getTime() < Date.now()) return 'vencida';
  }
  return 'disponivel';
}

function statusColor(
  status: Exclude<StatusFiltro, 'all'>,
  colors: { primary: string; success: string; error: string; textSecondary: string },
) {
  if (status === 'disponivel') return colors.success;
  if (status === 'enviada') return colors.primary;
  if (status === 'rejeitada') return colors.error;
  return colors.textSecondary;
}

function statusLabel(status: Exclude<StatusFiltro, 'all'>) {
  if (status === 'disponivel') return 'Disponível';
  if (status === 'enviada') return 'Enviada';
  if (status === 'rejeitada') return 'Rejeitada';
  return 'Vencida';
}

function toggleInList(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export default function PncpLicitacoesScreen() {
  const navigation = useNavigation();
  const navState = navigation.getState?.();
  const isTabScreen = navState?.type === 'tab';
  const { colors, isDark } = useTheme();
  const { canSeePncp, isLoading: permissionsLoading } = usePermissions();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors, isDark);
  const defaults = useMemo(() => defaultRange(), []);

  useEffect(() => {
    if (!permissionsLoading && !canSeePncp) {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        (navigation as any).navigate('Main', { screen: 'Home' });
      }
    }
  }, [permissionsLoading, canSeePncp, navigation]);

  const [rows, setRows] = useState<PncpItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [totalRegistros, setTotalRegistros] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [statusCounts, setStatusCounts] = useState<PncpListResult['statusCounts']>();
  const [detail, setDetail] = useState<PncpItem | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  // Rascunho do modal
  const [draftUfs, setDraftUfs] = useState<string[]>(['DF']);
  const [draftModalidades, setDraftModalidades] = useState<string[]>([]);
  const [draftDataInicial, setDraftDataInicial] = useState(defaults.dataInicial);
  const [draftDataFinal, setDraftDataFinal] = useState(defaults.dataFinal);
  const [valorModo, setValorModo] = useState<ValorFiltroModo>('');
  const [valorFiltro, setValorFiltro] = useState('');
  const [valorDe, setValorDe] = useState('');
  const [valorAte, setValorAte] = useState('');

  const [applied, setApplied] = useState<AppliedFilters>({
    ufs: ['DF'],
    modalidadeCodigos: [],
    dataInicial: defaults.dataInicial,
    dataFinal: defaults.dataFinal,
    valorMin: null,
    valorMax: null,
    statusAnalise: 'disponivel',
    q: '',
    pagina: 1,
  });

  const loadList = useCallback(async () => {
    try {
      const ufParam =
        applied.ufs.length === 0 || applied.ufs.length === BRASIL_UFS.length
          ? 'all'
          : applied.ufs.join(',');
      const modalidadeParam =
        applied.modalidadeCodigos.length === 0 ||
        applied.modalidadeCodigos.length === MODALIDADE_OPTIONS.length
          ? 'all'
          : applied.modalidadeCodigos.join(',');

      const params = new URLSearchParams({
        uf: ufParam,
        codigoModalidadeContratacao: modalidadeParam,
        dataInicial: toYyyymmdd(applied.dataInicial),
        dataFinal: toYyyymmdd(applied.dataFinal),
        pagina: String(applied.pagina),
        tamanhoPagina: '20',
        statusAnalise: applied.statusAnalise,
      });
      if (applied.valorMin != null) params.set('valorMin', String(applied.valorMin));
      if (applied.valorMax != null) params.set('valorMax', String(applied.valorMax));
      const q = applied.q.trim();
      if (
        q.length >= MIN_SEARCH_LEN ||
        /^\d{14}-\d+-\d+\s*\/\s*\d{4}$/.test(q)
      ) {
        params.set('q', q);
      }

      const res = await api.get(`/api/pncp/contratacoes?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || json?.error || 'Erro ao carregar PNCP');
      }
      const data = (json?.data ?? json) as PncpListResult;
      setRows(Array.isArray(data.items) ? data.items : []);
      setTotalRegistros(data.totalRegistros ?? data.items?.length ?? 0);
      setTotalPaginas(Math.max(1, data.totalPaginas ?? 1));
      if (data.statusCounts) setStatusCounts(data.statusCounts);
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Erro',
        text2: e?.message || 'Não foi possível carregar as licitações',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [applied]);

  useEffect(() => {
    setLoading(true);
    void loadList();
  }, [loadList]);

  // Busca com debounce (igual web)
  useEffect(() => {
    const timer = setTimeout(() => {
      const nextQ = searchTerm.trim();
      const usable =
        nextQ.length === 0 ||
        nextQ.length >= MIN_SEARCH_LEN ||
        /^\d{14}-\d+-\d+\s*\/\s*\d{4}$/.test(nextQ);
      if (!usable) return;
      setApplied((prev) => {
        if (prev.q === nextQ) return prev;
        return { ...prev, q: nextQ, pagina: 1 };
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const filterChips = useMemo(
    () =>
      [
        { id: 'disponivel' as const, label: 'Disponíveis' },
        { id: 'enviada' as const, label: 'Enviadas' },
        { id: 'rejeitada' as const, label: 'Rejeitadas' },
        { id: 'vencida' as const, label: 'Vencidas' },
        { id: 'all' as const, label: 'Todas' },
      ],
    [],
  );

  const countFor = (id: StatusFiltro) => {
    if (!statusCounts) return null;
    return statusCounts[id] ?? null;
  };

  const hasActiveFilters =
    !(applied.ufs.length === 1 && applied.ufs[0] === 'DF') ||
    applied.modalidadeCodigos.length > 0 ||
    applied.dataInicial !== defaults.dataInicial ||
    applied.dataFinal !== defaults.dataFinal ||
    applied.valorMin != null ||
    applied.valorMax != null;

  const openFilters = () => {
    setDraftUfs(applied.ufs);
    setDraftModalidades(applied.modalidadeCodigos);
    setDraftDataInicial(applied.dataInicial);
    setDraftDataFinal(applied.dataFinal);
    setShowFilters(true);
  };

  const applyFilters = () => {
    if (!draftDataInicial || !draftDataFinal) {
      Toast.show({ type: 'error', text1: 'Informe o período de abertura.' });
      return;
    }
    if (draftDataInicial > draftDataFinal) {
      Toast.show({ type: 'error', text1: 'A data inicial não pode ser maior que a final.' });
      return;
    }
    const { valorMin, valorMax } = resolveValorBounds(valorModo, valorFiltro, valorDe, valorAte);
    if (valorModo === 'between' && valorMin != null && valorMax != null && valorMin > valorMax) {
      Toast.show({ type: 'error', text1: 'O valor inicial não pode ser maior que o final.' });
      return;
    }
    const valorCompleto =
      valorModo === '' ||
      (valorModo === 'gt' && valorMin != null) ||
      (valorModo === 'lt' && valorMax != null) ||
      (valorModo === 'between' && valorMin != null && valorMax != null);

    setApplied((prev) => ({
      ...prev,
      ufs: draftUfs.length ? draftUfs : ['DF'],
      modalidadeCodigos: draftModalidades,
      dataInicial: draftDataInicial,
      dataFinal: draftDataFinal,
      valorMin: valorCompleto ? valorMin : null,
      valorMax: valorCompleto ? valorMax : null,
      pagina: 1,
    }));
    setShowFilters(false);
  };

  const clearFilters = () => {
    setDraftUfs(['DF']);
    setDraftModalidades([]);
    setDraftDataInicial(defaults.dataInicial);
    setDraftDataFinal(defaults.dataFinal);
    setValorModo('');
    setValorFiltro('');
    setValorDe('');
    setValorAte('');
    setApplied((prev) => ({
      ...prev,
      ufs: ['DF'],
      modalidadeCodigos: [],
      dataInicial: defaults.dataInicial,
      dataFinal: defaults.dataFinal,
      valorMin: null,
      valorMax: null,
      statusAnalise: 'disponivel',
      pagina: 1,
    }));
    setShowFilters(false);
  };

  const patchItem = (numero: string, patch: Partial<PncpItem>) => {
    setRows((prev) =>
      prev.map((item) => (item.numeroControlePNCP === numero ? { ...item, ...patch } : item)),
    );
    setDetail((prev) =>
      prev?.numeroControlePNCP === numero ? { ...prev, ...patch } : prev,
    );
  };

  const enviarAnalise = async (row: PncpItem) => {
    const numero = row.numeroControlePNCP?.trim();
    if (!numero) return;
    setSendingId(numero);
    try {
      const res = await api.post('/api/pncp/enviar-analise', { numeroControlePNCP: numero });
      const json = await res.json();
      if (!res.ok && res.status !== 409) {
        throw new Error(json?.message || 'Erro ao enviar');
      }
      const data = json?.data ?? {};
      patchItem(numero, {
        enviadoAnalise: true,
        enviadoAnaliseRegiaoKey: data.regiaoKey ?? null,
        enviadoAnaliseAt: data.enviadoAt ?? new Date().toISOString(),
        rejeitadoAnalise: false,
        rejeitadoAnaliseAt: null,
        rejeitadoAnaliseByName: null,
      });
      Toast.show({
        type: res.status === 409 ? 'info' : 'success',
        text1: res.status === 409 ? 'Já enviada' : 'Enviada',
        text2: data.regiaoLabel ? `Região: ${data.regiaoLabel}` : json?.message,
      });
      if (applied.statusAnalise === 'disponivel') {
        setRows((prev) => prev.filter((i) => i.numeroControlePNCP !== numero));
        setDetail(null);
      }
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Erro', text2: e?.message || 'Falha ao enviar' });
    } finally {
      setSendingId(null);
    }
  };

  const rejeitar = (row: PncpItem) => {
    const numero = row.numeroControlePNCP?.trim();
    if (!numero) return;
    Alert.alert('Rejeitar licitação', 'Confirma rejeitar esta contratação do PNCP?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Rejeitar',
        style: 'destructive',
        onPress: async () => {
          setRejectingId(numero);
          try {
            const res = await api.post('/api/pncp/rejeitar', { numeroControlePNCP: numero });
            const json = await res.json();
            if (!res.ok && res.status !== 409) {
              throw new Error(json?.message || 'Erro ao rejeitar');
            }
            patchItem(numero, {
              rejeitadoAnalise: true,
              rejeitadoAnaliseAt: new Date().toISOString(),
              enviadoAnalise: false,
            });
            Toast.show({
              type: res.status === 409 ? 'info' : 'success',
              text1: res.status === 409 ? 'Já rejeitada' : 'Rejeitada',
            });
            if (applied.statusAnalise === 'disponivel') {
              setRows((prev) => prev.filter((i) => i.numeroControlePNCP !== numero));
              setDetail(null);
            }
          } catch (e: any) {
            Toast.show({ type: 'error', text1: 'Erro', text2: e?.message || 'Falha ao rejeitar' });
          } finally {
            setRejectingId(null);
          }
        },
      },
    ]);
  };

  const openLink = async (url: string | null | undefined) => {
    if (!url) {
      Toast.show({ type: 'info', text1: 'Link indisponível' });
      return;
    }
    try {
      await Linking.openURL(url);
    } catch {
      Toast.show({ type: 'error', text1: 'Não foi possível abrir o link' });
    }
  };

  const detailStatus = detail ? itemStatus(detail) : null;
  const canAct = detailStatus === 'disponivel';

  if (permissionsLoading || !canSeePncp) {
    return (
      <View style={[styles.safeArea, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader
        showBack={!isTabScreen}
        onBack={() => navigation.goBack()}
        title={!isTabScreen ? 'PNCP' : undefined}
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, isTabScreen && { paddingBottom: 110 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadList();
            }}
            tintColor={colors.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.pageTitle}>Licitações</Text>
        <Text style={styles.pageSubtitle}>Consulte contratações do PNCP</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {filterChips.map((chip) => {
            const active = applied.statusAnalise === chip.id;
            const count = countFor(chip.id);
            return (
              <TouchableOpacity
                key={chip.id}
                onPress={() =>
                  setApplied((prev) => ({ ...prev, statusAnalise: chip.id, pagina: 1 }))
                }
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{chip.label}</Text>
                {count != null ? (
                  <Text style={[styles.chipCount, active && styles.chipCountActive]}>{count}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Search size={16} color={colors.textSecondary} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              placeholder="Objeto, órgão, processo..."
              placeholderTextColor={colors.textSecondary}
              value={searchTerm}
              onChangeText={setSearchTerm}
              returnKeyType="search"
            />
            {searchTerm.length > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  setSearchTerm('');
                  setApplied((prev) => ({ ...prev, q: '', pagina: 1 }));
                }}
                hitSlop={8}
              >
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            style={[styles.filterBtn, hasActiveFilters && styles.filterBtnActive]}
            onPress={openFilters}
            activeOpacity={0.75}
          >
            <Filter
              size={18}
              color={hasActiveFilters ? '#fff' : colors.primary}
              strokeWidth={2.2}
            />
            {hasActiveFilters ? <View style={styles.filterDot} /> : null}
          </TouchableOpacity>
        </View>

        {hasActiveFilters ? (
          <Text style={styles.activeFilterHint}>
            {formatUfLabel(applied.ufs)} · {formatModalidadeLabel(applied.modalidadeCodigos)}
            {applied.valorMin != null || applied.valorMax != null ? ' · filtro de valor' : ''}
          </Text>
        ) : null}

        <View style={styles.listHeader}>
          <Text style={styles.listHeading}>
            {filterChips.find((c) => c.id === applied.statusAnalise)?.label || 'Licitações'}
          </Text>
          <Text style={styles.listHeadingMeta}>{totalRegistros}</Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
        ) : rows.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <ClipboardList size={28} color={colors.textSecondary} />
            </View>
            <Text style={styles.emptyTitle}>Nenhuma licitação</Text>
            <Text style={styles.emptyText}>
              Não há contratações para este filtro no período.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {rows.map((row) => {
              const status = itemStatus(row);
              const key = row.numeroControlePNCP || `${row.orgao}-${row.objeto}`;
              return (
                <TouchableOpacity
                  key={key}
                  style={styles.card}
                  onPress={() => setDetail(row)}
                  activeOpacity={0.85}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.cardUf}>
                      {[row.uf, row.municipio].filter(Boolean).join(' · ') || '—'}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: `${statusColor(status, colors)}18` },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: statusColor(status, colors) }]}>
                        {statusLabel(status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={3}>
                    {row.objeto || 'Sem objeto'}
                  </Text>
                  <Text style={styles.cardOrg} numberOfLines={1}>
                    {row.orgao || 'Órgão não informado'}
                  </Text>
                  <View style={styles.cardFooter}>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {row.modalidade || 'Modalidade —'}
                    </Text>
                    <View style={styles.dot} />
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {formatMoney(row.valorEstimado)}
                    </Text>
                  </View>
                  <Text style={styles.cardHint}>Toque para enviar ou ver detalhes</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!loading && totalPaginas > 1 ? (
          <View style={styles.pager}>
            <TouchableOpacity
              disabled={applied.pagina <= 1}
              onPress={() =>
                setApplied((prev) => ({ ...prev, pagina: Math.max(1, prev.pagina - 1) }))
              }
              style={[styles.pagerBtn, applied.pagina <= 1 && styles.pagerBtnDisabled]}
            >
              <Text style={styles.pagerBtnText}>Anterior</Text>
            </TouchableOpacity>
            <Text style={styles.pagerLabel}>
              {applied.pagina} / {totalPaginas}
            </Text>
            <TouchableOpacity
              disabled={applied.pagina >= totalPaginas}
              onPress={() =>
                setApplied((prev) => ({
                  ...prev,
                  pagina: Math.min(totalPaginas, prev.pagina + 1),
                }))
              }
              style={[
                styles.pagerBtn,
                applied.pagina >= totalPaginas && styles.pagerBtnDisabled,
              ]}
            >
              <Text style={styles.pagerBtnText}>Próxima</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollView>

      {/* Filtros (iguais ao web) */}
      <Modal
        visible={showFilters}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={[styles.detailSafe, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.formHeader}>
            <View style={styles.formHeaderText}>
              <Text style={styles.formTitle}>Filtros</Text>
              <Text style={styles.formSubtitle}>UF, modalidade, período e valor</Text>
            </View>
            <TouchableOpacity style={styles.formCloseBtn} onPress={() => setShowFilters(false)}>
              <X size={22} color={colors.text} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.filterScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.fieldLabel}>UF</Text>
            <View style={styles.optionWrap}>
              <TouchableOpacity
                style={[
                  styles.optionChip,
                  draftUfs.length === BRASIL_UFS.length && styles.optionChipActive,
                ]}
                onPress={() => setDraftUfs([...BRASIL_UFS])}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    draftUfs.length === BRASIL_UFS.length && styles.optionChipTextActive,
                  ]}
                >
                  Todas
                </Text>
              </TouchableOpacity>
              {BRASIL_UFS.map((code) => {
                const active = draftUfs.includes(code);
                return (
                  <TouchableOpacity
                    key={code}
                    style={[styles.optionChip, active && styles.optionChipActive]}
                    onPress={() => setDraftUfs((prev) => toggleInList(prev, code))}
                  >
                    <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>
                      {code}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Modalidade</Text>
            <View style={styles.optionWrap}>
              <TouchableOpacity
                style={[
                  styles.optionChip,
                  draftModalidades.length === 0 && styles.optionChipActive,
                ]}
                onPress={() => setDraftModalidades([])}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    draftModalidades.length === 0 && styles.optionChipTextActive,
                  ]}
                >
                  Todas
                </Text>
              </TouchableOpacity>
              {MODALIDADE_OPTIONS.map((m) => {
                const active = draftModalidades.includes(m.codigo);
                return (
                  <TouchableOpacity
                    key={m.codigo}
                    style={[styles.optionChip, active && styles.optionChipActive]}
                    onPress={() => setDraftModalidades((prev) => toggleInList(prev, m.codigo))}
                  >
                    <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>
                      {m.nome}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <DateField
              label="Abertura de"
              value={draftDataInicial}
              onChange={setDraftDataInicial}
              mode="date"
            />
            <DateField
              label="Abertura até"
              value={draftDataFinal}
              onChange={setDraftDataFinal}
              mode="date"
            />

            <Text style={styles.fieldLabel}>Valor estimado</Text>
            <View style={styles.optionWrap}>
              {VALOR_MODO_OPTIONS.map((opt) => {
                const active = valorModo === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.optionChip, active && styles.optionChipActive]}
                    onPress={() => {
                      setValorModo(opt.value);
                      if (!opt.value) {
                        setValorFiltro('');
                        setValorDe('');
                        setValorAte('');
                      }
                    }}
                  >
                    <Text style={[styles.optionChipText, active && styles.optionChipTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {valorModo === 'gt' || valorModo === 'lt' ? (
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={valorFiltro}
                onChangeText={(t) => setValorFiltro(maskCurrencyOrEmpty(t))}
                placeholder={valorModo === 'gt' ? 'Maior que R$ 0,00' : 'Menor que R$ 0,00'}
                placeholderTextColor={colors.textSecondary}
              />
            ) : null}

            {valorModo === 'between' ? (
              <View style={styles.valorBetween}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  keyboardType="numeric"
                  value={valorDe}
                  onChangeText={(t) => setValorDe(maskCurrencyOrEmpty(t))}
                  placeholder="De R$ 0,00"
                  placeholderTextColor={colors.textSecondary}
                />
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  keyboardType="numeric"
                  value={valorAte}
                  onChangeText={(t) => setValorAte(maskCurrencyOrEmpty(t))}
                  placeholder="Até R$ 0,00"
                  placeholderTextColor={colors.textSecondary}
                />
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.formFooter}>
            <TouchableOpacity style={styles.rejectBtn} onPress={clearFilters} activeOpacity={0.8}>
              <RotateCcw size={16} color="#dc2626" strokeWidth={2.2} />
              <Text style={styles.rejectBtnText}>Limpar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sendBtn} onPress={applyFilters} activeOpacity={0.8}>
              <Filter size={16} color="#fff" strokeWidth={2.2} />
              <Text style={styles.sendBtnText}>Aplicar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Detalhe */}
      <Modal
        visible={!!detail}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetail(null)}
      >
        <View style={[styles.detailSafe, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <View style={styles.formHeader}>
            <TouchableOpacity style={styles.formCloseBtn} onPress={() => setDetail(null)}>
              <X size={22} color={colors.text} strokeWidth={2} />
            </TouchableOpacity>
            <View style={styles.formHeaderText}>
              <Text style={styles.formTitle}>Detalhe PNCP</Text>
              <Text style={styles.formSubtitle} numberOfLines={1}>
                {detail?.numeroControlePNCP || 'Sem número de controle'}
              </Text>
            </View>
          </View>

          {detail ? (
            <ScrollView
              contentContainerStyle={styles.detailScroll}
              showsVerticalScrollIndicator={false}
            >
              {detailStatus ? (
                <View
                  style={[
                    styles.detailBadge,
                    { backgroundColor: `${statusColor(detailStatus, colors)}18` },
                  ]}
                >
                  <Text style={{ color: statusColor(detailStatus, colors), fontWeight: '700' }}>
                    {statusLabel(detailStatus)}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.detailObjeto}>{detail.objeto || 'Sem objeto'}</Text>

              <View style={styles.detailBlock}>
                <View style={styles.detailRow}>
                  <Building2 size={16} color={colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Órgão</Text>
                    <Text style={styles.detailValue}>{detail.orgao || '—'}</Text>
                  </View>
                </View>
                <View style={styles.detailRow}>
                  <MapPin size={16} color={colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Local</Text>
                    <Text style={styles.detailValue}>
                      {[detail.municipio, detail.uf].filter(Boolean).join(' / ') || '—'}
                    </Text>
                  </View>
                </View>
                <View style={styles.detailRow}>
                  <ClipboardList size={16} color={colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Modalidade</Text>
                    <Text style={styles.detailValue}>{detail.modalidade || '—'}</Text>
                  </View>
                </View>
                <View style={styles.detailRow}>
                  <Calendar size={16} color={colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailLabel}>Encerramento das propostas</Text>
                    <Text style={styles.detailValue}>
                      {formatDateLabel(detail.dataEncerramentoProposta)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.moneyCard}>
                <Text style={styles.detailLabel}>Valor estimado</Text>
                <Text style={styles.moneyValue}>{formatMoney(detail.valorEstimado)}</Text>
                {detail.processo ? (
                  <Text style={styles.processo}>Processo {detail.processo}</Text>
                ) : null}
              </View>

              {detail.enviadoAnalise ? (
                <Text style={styles.metaNote}>
                  Enviada
                  {detail.enviadoAnaliseByName ? ` por ${detail.enviadoAnaliseByName}` : ''}
                  {detail.enviadoAnaliseAt ? ` · ${formatDateLabel(detail.enviadoAnaliseAt)}` : ''}
                </Text>
              ) : null}
              {detail.rejeitadoAnalise ? (
                <Text style={styles.metaNote}>
                  Rejeitada
                  {detail.rejeitadoAnaliseByName ? ` por ${detail.rejeitadoAnaliseByName}` : ''}
                  {detail.rejeitadoAnaliseAt
                    ? ` · ${formatDateLabel(detail.rejeitadoAnaliseAt)}`
                    : ''}
                </Text>
              ) : null}

              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() =>
                  openLink(detail.linkPncp || buildPncpEditalUrl(detail.numeroControlePNCP))
                }
                activeOpacity={0.75}
              >
                <ExternalLink size={16} color={colors.primary} strokeWidth={2.2} />
                <Text style={styles.linkBtnText}>Abrir no PNCP</Text>
              </TouchableOpacity>

              {detail.linkSistemaOrigem ? (
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => openLink(detail.linkSistemaOrigem)}
                  activeOpacity={0.75}
                >
                  <ExternalLink size={16} color={colors.primary} strokeWidth={2.2} />
                  <Text style={styles.linkBtnText}>Sistema de origem</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          ) : null}

          {detail && canAct ? (
            <View style={styles.formFooter}>
              <TouchableOpacity
                style={styles.rejectBtn}
                onPress={() => rejeitar(detail)}
                disabled={!!rejectingId || !!sendingId}
                activeOpacity={0.8}
              >
                {rejectingId === detail.numeroControlePNCP ? (
                  <ActivityIndicator color="#dc2626" />
                ) : (
                  <>
                    <ThumbsDown size={16} color="#dc2626" strokeWidth={2.2} />
                    <Text style={styles.rejectBtnText}>Rejeitar</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sendBtn}
                onPress={() => void enviarAnalise(detail)}
                disabled={!!sendingId || !!rejectingId}
                activeOpacity={0.8}
              >
                {sendingId === detail.numeroControlePNCP ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Send size={16} color="#fff" strokeWidth={2.2} />
                    <Text style={styles.sendBtnText}>Enviar para análise</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.screenRoot },
    container: { flex: 1, backgroundColor: colors.screenRoot },
    scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
    pageTitle: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: -0.6,
      marginBottom: 4,
    },
    pageSubtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
      marginBottom: 18,
    },
    chipsRow: { gap: 8, paddingBottom: 12 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: '#fff' },
    chipCount: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      opacity: 0.7,
    },
    chipCountActive: { color: 'rgba(255,255,255,0.85)', opacity: 1 },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 10,
      marginBottom: 10,
    },
    searchBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderRadius: 14,
      paddingHorizontal: 14,
      minHeight: 48,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    searchInput: {
      flex: 1,
      paddingVertical: Platform.OS === 'ios' ? 12 : 8,
      color: colors.text,
      fontSize: 15,
    },
    filterBtn: {
      width: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    filterBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterDot: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: '#fff',
    },
    activeFilterHint: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
      marginBottom: 14,
    },
    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    listHeading: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
    },
    listHeadingMeta: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    list: { gap: 10 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 16,
    },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
      gap: 8,
    },
    cardUf: {
      flex: 1,
      fontWeight: '700',
      color: colors.textSecondary,
      fontSize: 13,
      letterSpacing: 0.2,
    },
    badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    cardTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
      letterSpacing: -0.2,
      lineHeight: 22,
    },
    cardOrg: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 10,
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    cardMeta: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, flexShrink: 1 },
    dot: {
      width: 3,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.textSecondary,
      opacity: 0.45,
    },
    cardHint: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, opacity: 0.8 },
    empty: { alignItems: 'center', paddingVertical: 56, gap: 8, paddingHorizontal: 24 },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: isDark ? colors.card : colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
    pager: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 18,
      gap: 12,
    },
    pagerBtn: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    pagerBtnDisabled: { opacity: 0.4 },
    pagerBtnText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
    pagerLabel: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
    detailSafe: { flex: 1, backgroundColor: colors.screenRoot },
    formHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 16,
    },
    formCloseBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    formHeaderText: { flex: 1 },
    formTitle: {
      color: colors.text,
      fontSize: 24,
      fontWeight: '700',
      letterSpacing: -0.5,
    },
    formSubtitle: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '500',
      marginTop: 2,
    },
    filterScroll: { paddingHorizontal: 20, paddingBottom: 28 },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
      marginTop: 6,
      letterSpacing: -0.1,
    },
    optionWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 14,
    },
    optionChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    optionChipActive: {
      backgroundColor: isDark ? 'rgba(206,55,54,0.22)' : 'rgba(206,55,54,0.1)',
      borderColor: colors.primary,
    },
    optionChipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    optionChipTextActive: { color: colors.primary },
    input: {
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
      backgroundColor: isDark ? colors.card : colors.surface,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 14,
    },
    valorBetween: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    detailScroll: { paddingHorizontal: 20, paddingBottom: 24 },
    detailBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      marginBottom: 12,
    },
    detailObjeto: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
      lineHeight: 26,
      marginBottom: 16,
    },
    detailBlock: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 14,
      gap: 14,
      marginBottom: 12,
    },
    detailRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    detailLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 2,
    },
    detailValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: -0.2,
    },
    moneyCard: {
      backgroundColor: isDark ? colors.card : colors.surface,
      borderRadius: 18,
      padding: 16,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    moneyValue: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.4,
      marginTop: 4,
    },
    processo: {
      marginTop: 8,
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    metaNote: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 10,
    },
    linkBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 12,
    },
    linkBtnText: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 14,
    },
    formFooter: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rejectBtn: {
      flex: 1,
      minHeight: 50,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(220,38,38,0.15)' : 'rgba(220,38,38,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    rejectBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 14 },
    sendBtn: {
      flex: 1.4,
      minHeight: 50,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  });
