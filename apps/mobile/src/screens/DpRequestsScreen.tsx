import React, { useEffect, useMemo, useState } from 'react';
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
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import {
  Plus,
  Users,
  ClipboardList,
  MailPlus,
  X,
  ChevronDown,
  Filter,
  Paperclip,
  Search,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import AppHeader from '../components/AppHeader';
import DateField from '../components/DateField';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { onFabBarPress } from '../navigation/fabBarEvents';
import {
  ADM_SIMPLE_TYPES,
  createDpRequest,
  destinationLabel,
  DP_TYPE_LABELS,
  fetchEligibleContracts,
  fetchMyDpRequests,
  fetchPayrollEmployees,
  isAdmTstRequestType,
  STATUS_LABELS,
  submitRequesterReturn,
  URGENCY_LABELS,
  type DpEligibleContract,
  type DpRequest,
  type DpRequestStatus,
  type DpRequestType,
  type DpUrgency,
  type PayrollEmployeeOption,
} from '../services/dpRequests';

type DestFilter = 'all' | 'DP' | 'ADM_TST';
type CreateTarget = 'DP' | 'ADM_TST' | null;

const DP_TYPES: DpRequestType[] = [
  'ADMISSAO',
  'ADVERTENCIA_SUSPENSAO',
  'ALTERACAO_FUNCAO_SALARIO',
  'ATESTADO_MEDICO',
  'BENEFICIOS_VIAGEM',
  'FERIAS',
  'HORA_EXTRA',
  'OUTRAS_SOLICITACOES',
  'RESCISAO',
  'RETIFICACAO_ALOCACAO',
];

const ADM_TYPES: DpRequestType[] = [
  'ADM_VIAGENS',
  'ADM_EPI_FARDAMENTO',
  'ADM_MANUTENCAO_ESCRITORIO',
  'ADM_MATERIAL_ESCRITORIO',
  'ADM_INFORMATICA',
  'ADM_TREINAMENTOS_NR',
  'ADM_ASOS',
];

function mapPolo(raw?: string | null): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const u = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (u === 'DF' || u.includes('BRASILIA')) return 'DF';
  if (u === 'GO' || u.includes('GOIAS')) return 'GO';
  return '';
}

function statusColor(status: DpRequestStatus, colors: any) {
  if (status === 'CONCLUDED') return colors.success;
  if (status === 'CANCELLED') return colors.error;
  if (status === 'WAITING_RETURN') return colors.warning;
  if (status.startsWith('WAITING_')) return '#f97316';
  if (status === 'IN_FINANCEIRO') return '#6366f1';
  return colors.warning;
}

type Attachment = { fileName: string; mimeType: string; dataBase64: string };

async function pickAttachment(): Promise<Attachment | null> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Toast.show({ type: 'error', text1: 'Permissão de galeria necessária' });
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
    base64: true,
  });
  if (result.canceled || !result.assets[0]?.base64) return null;
  const asset = result.assets[0];
  const dataBase64 = asset.base64!;
  if (dataBase64.length > 2_800_000) {
    Toast.show({ type: 'error', text1: 'Arquivo muito grande (máx. ~2 MB)' });
    return null;
  }
  return {
    fileName: asset.fileName || `anexo-${Date.now()}.jpg`,
    mimeType: asset.mimeType || 'image/jpeg',
    dataBase64,
  };
}

export default function DpRequestsScreen() {
  const navigation = useNavigation();
  const navState = navigation.getState?.() as { type?: string } | undefined;
  const isTabScreen = navState?.type === 'tab';
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const myEmployeeId = user?.employee?.id || '';
  const isDepartamentoPessoal = !!user?.employee?.department
    ?.toLowerCase()
    .includes('pessoal');

  const [destFilter, setDestFilter] = useState<DestFilter>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | DpRequestStatus>('all');
  const [filterOpen, setFilterOpen] = useState(false);

  const [detail, setDetail] = useState<DpRequest | null>(null);
  const [returnComment, setReturnComment] = useState('');
  const [returning, setReturning] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createTarget, setCreateTarget] = useState<CreateTarget>(null);
  const [urgency, setUrgency] = useState<DpUrgency>('MEDIUM');
  const [requestType, setRequestType] = useState<DpRequestType | ''>('');
  const [contractId, setContractId] = useState('');
  const [company, setCompany] = useState('');
  const [polo, setPolo] = useState('');
  const [prazoInicio, setPrazoInicio] = useState('');
  const [prazoFim, setPrazoFim] = useState('');
  const [saving, setSaving] = useState(false);

  // Shared detail fields
  const [employeeId, setEmployeeId] = useState(myEmployeeId);
  const [detalhes, setDetalhes] = useState('');
  const [motivo, setMotivo] = useState('');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [numeroDias, setNumeroDias] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [datas, setDatas] = useState('');
  const [tipoSolicitacao, setTipoSolicitacao] = useState('');
  const [situacao, setSituacao] = useState('');
  const [valores, setValores] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [punicao, setPunicao] = useState<'ADVERTENCIA' | 'SUSPENSAO'>('ADVERTENCIA');
  const [tipoAviso, setTipoAviso] = useState('');
  const [tipoRescisao, setTipoRescisao] = useState('');
  const [funcaoAntigo, setFuncaoAntigo] = useState('');
  const [funcaoNovo, setFuncaoNovo] = useState('');
  const [tipoAlteracao, setTipoAlteracao] = useState<'FUNCAO' | 'SALARIO'>('FUNCAO');
  const [cidade, setCidade] = useState('');
  const [pedagio, setPedagio] = useState<'SIM' | 'NAO'>('NAO');
  const [candidatoNome, setCandidatoNome] = useState('');
  const [candidatoFuncao, setCandidatoFuncao] = useState('');
  const [candidatoContato, setCandidatoContato] = useState('');
  const [candidatoSetor, setCandidatoSetor] = useState('');
  const [motivoContratacao, setMotivoContratacao] = useState('');
  const [asoTipo, setAsoTipo] = useState<
    'ADMISSIONAL' | 'DEMISSIONAL' | 'PERIODICO' | 'ALTERACAO_FUNCAO'
  >('ADMISSIONAL');
  const [asoCpf, setAsoCpf] = useState('');
  const [asoNascimento, setAsoNascimento] = useState('');
  const [asoSetor, setAsoSetor] = useState('');
  const [asoCargo, setAsoCargo] = useState('');
  const [asoNovoCargo, setAsoNovoCargo] = useState('');
  const [asoCentroCusto, setAsoCentroCusto] = useState('');
  const [asoLocal, setAsoLocal] = useState('');
  const [asoEmpresa, setAsoEmpresa] = useState('');
  const [seguirPcmso, setSeguirPcmso] = useState<'SIM' | 'NAO'>('SIM');
  const [attachment, setAttachment] = useState<Attachment | null>(null);

  const [empPickerOpen, setEmpPickerOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState('');
  const [contractPickerOpen, setContractPickerOpen] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: ['dp-my-requests'],
    queryFn: () => fetchMyDpRequests('all'),
  });

  const contractsQuery = useQuery({
    queryKey: ['dp-eligible-contracts'],
    queryFn: fetchEligibleContracts,
    enabled: createOpen,
  });

  const employeesQuery = useQuery({
    queryKey: ['payroll-employees-dp'],
    queryFn: fetchPayrollEmployees,
    enabled: createOpen,
  });

  const list = listQuery.data ?? [];
  const contracts = contractsQuery.data ?? [];
  const employees = employeesQuery.data ?? [];

  const stats = useMemo(() => {
    const dp = list.filter((r) => !isAdmTstRequestType(r.requestType)).length;
    const admTst = list.filter((r) => isAdmTstRequestType(r.requestType)).length;
    return { total: list.length, dp, admTst };
  }, [list]);

  const filtered = useMemo(() => {
    return list.filter((r) => {
      if (destFilter === 'DP' && isAdmTstRequestType(r.requestType)) return false;
      if (destFilter === 'ADM_TST' && !isAdmTstRequestType(r.requestType)) return false;
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      if (r.displayNumber != null && String(r.displayNumber).includes(q)) return true;
      if (r.id.toLowerCase().includes(q)) return true;
      const typeLabel = (DP_TYPE_LABELS[r.requestType] || r.requestType).toLowerCase();
      if (typeLabel.includes(q)) return true;
      if ((r.contract?.name || '').toLowerCase().includes(q)) return true;
      if ((STATUS_LABELS[r.status] || '').toLowerCase().includes(q)) return true;
      return false;
    });
  }, [list, destFilter, statusFilter, search]);

  const filterChips = useMemo(
    () =>
      [
        { key: 'all' as const, label: 'Todas', count: stats.total },
        { key: 'DP' as const, label: 'DP', count: stats.dp },
        { key: 'ADM_TST' as const, label: 'ADM/TST', count: stats.admTst },
      ] as const,
    [stats],
  );

  const typeOptions = useMemo(() => {
    if (createTarget === 'ADM_TST') {
      return ADM_TYPES.filter((t) => t !== 'ADM_ASOS' || isDepartamentoPessoal);
    }
    return DP_TYPES;
  }, [createTarget, isDepartamentoPessoal]);

  const selectedEmployee = employees.find((e) => e.id === employeeId);
  const selectedContract = contracts.find((c) => c.id === contractId);

  const resetCreateFields = () => {
    setUrgency('MEDIUM');
    setRequestType('');
    setContractId('');
    setCompany('');
    setPolo('');
    setPrazoInicio('');
    setPrazoFim('');
    setEmployeeId(myEmployeeId);
    setDetalhes('');
    setMotivo('');
    setDataInicial('');
    setDataFinal('');
    setNumeroDias('');
    setJustificativa('');
    setDatas('');
    setTipoSolicitacao('');
    setSituacao('');
    setValores('');
    setObservacoes('');
    setPunicao('ADVERTENCIA');
    setTipoAviso('');
    setTipoRescisao('');
    setFuncaoAntigo('');
    setFuncaoNovo('');
    setTipoAlteracao('FUNCAO');
    setCidade('');
    setPedagio('NAO');
    setCandidatoNome('');
    setCandidatoFuncao('');
    setCandidatoContato('');
    setCandidatoSetor('');
    setMotivoContratacao('');
    setAsoTipo('ADMISSIONAL');
    setAsoCpf('');
    setAsoNascimento('');
    setAsoSetor('');
    setAsoCargo('');
    setAsoNovoCargo('');
    setAsoCentroCusto('');
    setAsoLocal('');
    setAsoEmpresa('');
    setSeguirPcmso('SIM');
    setAttachment(null);
  };

  const openCreate = () => {
    resetCreateFields();
    setCreateTarget(null);
    setCreateOpen(true);
  };

  useEffect(() => {
    const sub = onFabBarPress('DpRequests', openCreate);
    return () => sub.remove();
  }, []);

  const onPickContract = (c: DpEligibleContract) => {
    setContractId(c.id);
    setCompany(c.costCenter?.company || c.name || '');
    setPolo(mapPolo(c.costCenter?.polo));
    setContractPickerOpen(false);
  };

  const buildDetails = (): Record<string, unknown> => {
    const emp = employeeId || myEmployeeId;
    if (!requestType) throw new Error('Selecione o tipo');
    if (!emp && requestType !== 'ADMISSAO') throw new Error('Selecione o colaborador');

    if (requestType === 'ADMISSAO') {
      if (!candidatoNome.trim() || !candidatoFuncao.trim() || !candidatoContato.trim()) {
        throw new Error('Preencha nome, função e contato do candidato');
      }
      if (!motivoContratacao.trim() || !candidatoSetor.trim()) {
        throw new Error('Informe motivo e setor da contratação');
      }
      return {
        candidatos: [
          {
            nome: candidatoNome.trim(),
            funcao: candidatoFuncao.trim(),
            contato: candidatoContato.trim(),
            motivoContratacao: motivoContratacao.trim(),
            setor: candidatoSetor.trim(),
            observacao: observacoes.trim() || undefined,
          },
        ],
      };
    }

    if ((ADM_SIMPLE_TYPES as readonly string[]).includes(requestType)) {
      if (!detalhes.trim()) throw new Error('Descreva os detalhes');
      return { itens: [{ employeeId: emp, detalhes: detalhes.trim() }] };
    }

    if (requestType === 'ADM_VIAGENS') {
      if (!dataInicial || !dataFinal || !cidade.trim() || !motivo.trim() || !numeroDias.trim()) {
        throw new Error('Preencha datas, cidade, motivo e nº de dias');
      }
      return {
        viagens: [
          {
            employeeId: emp,
            dataIda: dataInicial,
            dataVolta: dataFinal,
            cidade: cidade.trim(),
            motivoViagem: motivo.trim(),
            numeroDias: numeroDias.trim(),
            pedagio,
            observacoes: observacoes.trim() || undefined,
          },
        ],
      };
    }

    if (requestType === 'ADM_ASOS') {
      if (
        !asoCpf.trim() ||
        !asoNascimento ||
        !asoSetor.trim() ||
        !asoCargo.trim() ||
        !asoCentroCusto.trim() ||
        !asoLocal.trim() ||
        !asoEmpresa.trim()
      ) {
        throw new Error('Preencha todos os campos do ASO');
      }
      if (asoTipo === 'ALTERACAO_FUNCAO' && !asoNovoCargo.trim()) {
        throw new Error('Informe o novo cargo');
      }
      return {
        asos: [
          {
            asoTipo,
            employeeId: emp,
            dataNascimento: asoNascimento,
            cpf: asoCpf.trim(),
            setor: asoSetor.trim(),
            cargo: asoCargo.trim(),
            novoCargo: asoNovoCargo.trim() || undefined,
            centroCusto: asoCentroCusto.trim(),
            localTrabalho: asoLocal.trim(),
            empresa: asoEmpresa.trim(),
            seguirPcmso,
          },
        ],
      };
    }

    if (requestType === 'FERIAS') {
      if (!dataInicial || !dataFinal) throw new Error('Informe o período de férias');
      return {
        ferias: [
          {
            employeeId: emp,
            dataInicial,
            dataFinal,
            observacao: observacoes.trim() || undefined,
          },
        ],
      };
    }

    if (requestType === 'ADVERTENCIA_SUSPENSAO') {
      if (!motivo.trim()) throw new Error('Informe o motivo');
      return {
        medidas: [{ employeeId: emp, punicao, motivo: motivo.trim() }],
      };
    }

    if (requestType === 'ALTERACAO_FUNCAO_SALARIO') {
      if (!funcaoAntigo.trim() || !funcaoNovo.trim() || !justificativa.trim()) {
        throw new Error('Preencha valores antigo/novo e justificativa');
      }
      return {
        alteracoes: [
          {
            employeeId: emp,
            tipoAlteracaoFuncaoOuSalario: tipoAlteracao,
            funcaoSalarioAntigo: funcaoAntigo.trim(),
            funcaoSalarioNovo: funcaoNovo.trim(),
            justificativa: justificativa.trim(),
          },
        ],
      };
    }

    if (requestType === 'ATESTADO_MEDICO') {
      if (!dataInicial || !dataFinal || !numeroDias.trim()) {
        throw new Error('Informe o período e o nº de dias');
      }
      if (!attachment) throw new Error('Anexe o atestado (imagem)');
      return {
        atestados: [
          {
            employeeId: emp,
            dataInicial,
            dataFinal,
            numeroDias: numeroDias.trim(),
            anexoAtestado: attachment,
          },
        ],
      };
    }

    if (requestType === 'HORA_EXTRA') {
      if (!justificativa.trim() || !datas.trim()) {
        throw new Error('Informe justificativa e datas');
      }
      if (!attachment) throw new Error('Anexe a autorização (imagem)');
      return {
        horasExtras: [
          {
            employeeId: emp,
            justificativa: justificativa.trim(),
            datas: datas.trim(),
            anexoAutorizacao: attachment,
          },
        ],
      };
    }

    if (requestType === 'BENEFICIOS_VIAGEM') {
      if (!dataInicial || !dataFinal || !numeroDias.trim() || !motivo.trim()) {
        throw new Error('Preencha período, dias e motivo');
      }
      return {
        viagensBeneficio: [
          {
            employeeId: emp,
            dataInicial,
            dataFinal,
            numeroDias: numeroDias.trim(),
            motivoViagem: motivo.trim(),
            diasHotel: numeroDias.trim(),
          },
        ],
      };
    }

    if (requestType === 'RESCISAO') {
      if (!tipoAviso.trim() || !tipoRescisao.trim() || !motivo.trim()) {
        throw new Error('Preencha tipo de aviso, rescisão e motivo');
      }
      return {
        rescisoes: [
          {
            employeeId: emp,
            tipoAviso: tipoAviso.trim(),
            tipoRescisao: tipoRescisao.trim(),
            motivo: motivo.trim(),
            observacoes: observacoes.trim() || undefined,
          },
        ],
      };
    }

    if (requestType === 'RETIFICACAO_ALOCACAO') {
      if (!dataInicial || !justificativa.trim()) {
        throw new Error('Informe a data e a justificativa');
      }
      return {
        retificacoes: [
          { employeeId: emp, data: dataInicial, justificativa: justificativa.trim() },
        ],
      };
    }

    if (requestType === 'OUTRAS_SOLICITACOES') {
      if (!tipoSolicitacao.trim() || !situacao.trim() || !justificativa.trim()) {
        throw new Error('Preencha tipo, situação e justificativa');
      }
      return {
        itens: [
          {
            employeeId: emp,
            tipoSolicitacao: tipoSolicitacao.trim(),
            situacao: situacao.trim(),
            justificativa: justificativa.trim(),
            datas: datas.trim() || undefined,
            valores: valores.trim() || undefined,
            observacoes: observacoes.trim() || undefined,
          },
        ],
      };
    }

    throw new Error('Tipo não suportado neste formulário');
  };

  const submitCreate = async () => {
    try {
      if (!requestType) throw new Error('Selecione o tipo de solicitação');
      if (!contractId) throw new Error('Selecione o contrato');
      if (!prazoInicio || !prazoFim) throw new Error('Informe o prazo de retorno (início e fim)');
      const details = buildDetails();
      setSaving(true);
      await createDpRequest({
        urgency,
        requestType,
        contractId,
        company: company || undefined,
        polo: polo || undefined,
        prazoInicio,
        prazoFim,
        details,
      });
      Toast.show({ type: 'success', text1: 'Solicitação criada' });
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['dp-my-requests'] });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Erro', text2: e?.message || 'Falha ao criar' });
    } finally {
      setSaving(false);
    }
  };

  const sendReturn = async () => {
    if (!detail) return;
    const comment = returnComment.trim();
    if (!comment) {
      Toast.show({ type: 'error', text1: 'Escreva a resposta' });
      return;
    }
    setReturning(true);
    try {
      await submitRequesterReturn(detail.id, comment);
      Toast.show({ type: 'success', text1: 'Resposta enviada' });
      setReturnComment('');
      setDetail(null);
      await queryClient.invalidateQueries({ queryKey: ['dp-my-requests'] });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao responder' });
    } finally {
      setReturning(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return employees.slice(0, 80);
    return employees
      .filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.department || '').toLowerCase().includes(q),
      )
      .slice(0, 80);
  }, [employees, empSearch]);

  return (
    <View style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader
        showBack={!isTabScreen}
        title={!isTabScreen ? 'Solicitações' : undefined}
        onBack={() => navigation.goBack()}
        rightAction={
          !isTabScreen ? (
            <TouchableOpacity onPress={openCreate} hitSlop={8} accessibilityLabel="Nova">
              <Plus size={22} color={colors.text} strokeWidth={2.4} />
            </TouchableOpacity>
          ) : undefined
        }
      />

      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.scrollContent, isTabScreen && { paddingBottom: 110 }]}
        refreshControl={
          <RefreshControl
            refreshing={listQuery.isRefetching}
            onRefresh={() => void listQuery.refetch()}
            tintColor={colors.primary}
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isTabScreen ? (
          <Text style={styles.pageTitle}>Solicitações</Text>
        ) : null}
        <Text style={styles.pageSubtitle}>
          Crie e acompanhe pedidos ao DP e ADM/TST
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {filterChips.map(({ key, label, count }) => {
            const active = destFilter === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setDestFilter(key)}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                <Text style={[styles.chipCount, active && styles.chipCountActive]}>{count}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Search size={16} color={colors.textSecondary} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar tipo, nº, contrato..."
              placeholderTextColor={colors.textSecondary}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
            />
            {search.length > 0 ? (
              <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                <X size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
          <TouchableOpacity
            style={[styles.filterBtn, statusFilter !== 'all' && styles.filterBtnActive]}
            onPress={() => setFilterOpen(true)}
            activeOpacity={0.75}
            accessibilityLabel="Filtrar status"
          >
            <Filter
              size={18}
              color={statusFilter !== 'all' ? '#fff' : colors.primary}
              strokeWidth={2.2}
            />
            {statusFilter !== 'all' ? <View style={styles.filterDot} /> : null}
          </TouchableOpacity>
        </View>

        <View style={styles.listHeader}>
          <Text style={styles.listHeading}>
            {destFilter === 'all'
              ? 'Solicitações'
              : filterChips.find((c) => c.key === destFilter)?.label || 'Solicitações'}
          </Text>
          <Text style={styles.listHeadingMeta}>{filtered.length}</Text>
        </View>

        {listQuery.isLoading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <MailPlus size={28} color={colors.textSecondary} />
            </View>
            <Text style={styles.emptyTitle}>Nenhuma solicitação</Text>
            <Text style={styles.emptyText}>
              Toque no + para criar um pedido ao DP ou ADM/TST.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filtered.map((row) => (
              <View key={row.id} style={styles.card}>
                <TouchableOpacity
                  onPress={() => {
                    setDetail(row);
                    setReturnComment('');
                  }}
                  activeOpacity={0.85}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.cardNumber}>
                      #{row.displayNumber ?? row.id.slice(0, 8)}
                    </Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: `${statusColor(row.status, colors)}18` },
                      ]}
                    >
                      <Text
                        style={[styles.badgeText, { color: statusColor(row.status, colors) }]}
                      >
                        {STATUS_LABELS[row.status] || row.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardRoute} numberOfLines={2}>
                    {DP_TYPE_LABELS[row.requestType] || row.requestType}
                  </Text>
                  <View style={styles.cardFooter}>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {destinationLabel(row.requestType)}
                    </Text>
                    <View style={styles.dot} />
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {URGENCY_LABELS[row.urgency] || row.urgency}
                    </Text>
                  </View>
                  {row.contract?.name ? (
                    <Text style={styles.cardSub} numberOfLines={1}>
                      {row.contract.name}
                    </Text>
                  ) : null}
                  <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
                    Toque para ver detalhes
                  </Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Detail */}
      <Modal visible={!!detail} animationType="slide" onRequestClose={() => setDetail(null)}>
        <View style={[styles.safeArea, { paddingTop: 12 }]}>
          <View style={styles.modalHeaderBar}>
            <Text style={styles.modalTitle}>
              Solicitação #{detail?.displayNumber ?? detail?.id.slice(0, 8)}
            </Text>
            <TouchableOpacity onPress={() => setDetail(null)}>
              <X size={22} color={colors.text} />
            </TouchableOpacity>
          </View>
          {detail ? (
            <ScrollView contentContainerStyle={styles.pad}>
              <Info label="Status" value={STATUS_LABELS[detail.status]} styles={styles} />
              <Info
                label="Tipo"
                value={DP_TYPE_LABELS[detail.requestType] || detail.requestType}
                styles={styles}
              />
              <Info label="Destino" value={destinationLabel(detail.requestType)} styles={styles} />
              <Info
                label="Urgência"
                value={URGENCY_LABELS[detail.urgency] || detail.urgency}
                styles={styles}
              />
              <Info label="Contrato" value={detail.contract?.name || '—'} styles={styles} />
              <Info label="Empresa" value={detail.company || '—'} styles={styles} />
              <Info label="Polo" value={detail.polo || '—'} styles={styles} />
              {detail.dpFeedback ? (
                <Info label="Feedback" value={detail.dpFeedback} styles={styles} />
              ) : null}

              {detail.status === 'WAITING_RETURN' ? (
                <View style={styles.returnBox}>
                  <Text style={styles.returnTitle}>Sua pendência — responda ao DP</Text>
                  <TextInput
                    value={returnComment}
                    onChangeText={setReturnComment}
                    placeholder="Escreva sua resposta..."
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
                    multiline
                  />
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={() => void sendReturn()}
                    disabled={returning}
                  >
                    {returning ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Responder ao DP</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}
            </ScrollView>
          ) : null}
        </View>
      </Modal>

      {/* Filter */}
      <Modal visible={filterOpen} transparent animationType="fade" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.modalTitle}>Filtro de status</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity
                style={styles.optionRow}
                onPress={() => {
                  setStatusFilter('all');
                  setFilterOpen(false);
                }}
              >
                <Text style={styles.optionText}>Todos</Text>
              </TouchableOpacity>
              {(Object.keys(STATUS_LABELS) as DpRequestStatus[]).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={styles.optionRow}
                  onPress={() => {
                    setStatusFilter(s);
                    setFilterOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{STATUS_LABELS[s]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setFilterOpen(false)} style={{ marginTop: 8 }}>
              <Text style={{ textAlign: 'center', color: colors.textSecondary }}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Create */}
      <Modal visible={createOpen} animationType="slide" onRequestClose={() => setCreateOpen(false)}>
        <KeyboardAvoidingView
          style={styles.safeArea}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeaderBar}>
            <Text style={styles.modalTitle}>Nova solicitação</Text>
            <TouchableOpacity onPress={() => setCreateOpen(false)}>
              <X size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
            {!createTarget ? (
              <View style={{ gap: 12 }}>
                <Text style={styles.fieldLabel}>Para qual setor?</Text>
                <TouchableOpacity
                  style={styles.targetCard}
                  onPress={() => setCreateTarget('DP')}
                >
                  <Users size={22} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.targetTitle}>Departamento Pessoal</Text>
                    <Text style={styles.targetSub}>Admissão, férias, atestado, etc.</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.targetCard}
                  onPress={() => setCreateTarget('ADM_TST')}
                >
                  <ClipboardList size={22} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.targetTitle}>ADM/TST</Text>
                    <Text style={styles.targetSub}>Viagens, EPI, material, informática...</Text>
                  </View>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TouchableOpacity onPress={() => setCreateTarget(null)} style={{ marginBottom: 10 }}>
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>
                    ← Trocar destino ({createTarget === 'DP' ? 'DP' : 'ADM/TST'})
                  </Text>
                </TouchableOpacity>

                <Text style={styles.fieldLabel}>Urgência</Text>
                <View style={styles.chipRow}>
                  {(['MEDIUM', 'URGENT'] as DpUrgency[]).map((u) => (
                    <TouchableOpacity
                      key={u}
                      style={[styles.chip, urgency === u && styles.chipActive]}
                      onPress={() => setUrgency(u)}
                    >
                      <Text style={[styles.chipText, urgency === u && styles.chipTextActive]}>
                        {URGENCY_LABELS[u]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Tipo</Text>
                <TouchableOpacity style={styles.select} onPress={() => setTypePickerOpen(true)}>
                  <Text style={styles.selectText}>
                    {requestType ? DP_TYPE_LABELS[requestType] : 'Selecionar tipo'}
                  </Text>
                  <ChevronDown size={18} color={colors.textSecondary} />
                </TouchableOpacity>

                <Text style={styles.fieldLabel}>Contrato</Text>
                <TouchableOpacity style={styles.select} onPress={() => setContractPickerOpen(true)}>
                  <Text style={styles.selectText} numberOfLines={1}>
                    {selectedContract?.name || 'Selecionar contrato'}
                  </Text>
                  <ChevronDown size={18} color={colors.textSecondary} />
                </TouchableOpacity>

                <DateField label="Prazo início (retorno)" value={prazoInicio} onChange={setPrazoInicio} />
                <DateField label="Prazo fim (retorno)" value={prazoFim} onChange={setPrazoFim} />

                {requestType && requestType !== 'ADMISSAO' ? (
                  <>
                    <Text style={styles.fieldLabel}>Colaborador</Text>
                    <TouchableOpacity style={styles.select} onPress={() => setEmpPickerOpen(true)}>
                      <Text style={styles.selectText} numberOfLines={1}>
                        {selectedEmployee?.name ||
                          (employeeId ? 'Colaborador selecionado' : 'Selecionar colaborador')}
                      </Text>
                      <ChevronDown size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </>
                ) : null}

                {requestType === 'ADMISSAO' ? (
                  <>
                    <Field label="Nome do candidato" value={candidatoNome} onChange={setCandidatoNome} styles={styles} colors={colors} />
                    <Field label="Função" value={candidatoFuncao} onChange={setCandidatoFuncao} styles={styles} colors={colors} />
                    <Field label="Contato" value={candidatoContato} onChange={setCandidatoContato} styles={styles} colors={colors} />
                    <Field label="Setor" value={candidatoSetor} onChange={setCandidatoSetor} styles={styles} colors={colors} />
                    <Field label="Motivo da contratação" value={motivoContratacao} onChange={setMotivoContratacao} styles={styles} colors={colors} />
                    <Field label="Observação" value={observacoes} onChange={setObservacoes} styles={styles} colors={colors} multiline />
                  </>
                ) : null}

                {(ADM_SIMPLE_TYPES as readonly string[]).includes(requestType) ? (
                  <Field label="Detalhes" value={detalhes} onChange={setDetalhes} styles={styles} colors={colors} multiline />
                ) : null}

                {requestType === 'ADM_VIAGENS' ? (
                  <>
                    <DateField label="Data ida" value={dataInicial} onChange={setDataInicial} />
                    <DateField label="Data volta" value={dataFinal} onChange={setDataFinal} />
                    <Field label="Cidade" value={cidade} onChange={setCidade} styles={styles} colors={colors} />
                    <Field label="Motivo" value={motivo} onChange={setMotivo} styles={styles} colors={colors} />
                    <Field label="Nº de dias" value={numeroDias} onChange={setNumeroDias} styles={styles} colors={colors} />
                    <Text style={styles.fieldLabel}>Pedágio</Text>
                    <View style={styles.chipRow}>
                      {(['SIM', 'NAO'] as const).map((p) => (
                        <TouchableOpacity
                          key={p}
                          style={[styles.chip, pedagio === p && styles.chipActive]}
                          onPress={() => setPedagio(p)}
                        >
                          <Text style={[styles.chipText, pedagio === p && styles.chipTextActive]}>{p}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                ) : null}

                {requestType === 'FERIAS' ? (
                  <>
                    <DateField label="Data inicial" value={dataInicial} onChange={setDataInicial} />
                    <DateField label="Data final" value={dataFinal} onChange={setDataFinal} />
                    <Field label="Observação" value={observacoes} onChange={setObservacoes} styles={styles} colors={colors} multiline />
                  </>
                ) : null}

                {requestType === 'ADVERTENCIA_SUSPENSAO' ? (
                  <>
                    <Text style={styles.fieldLabel}>Punição</Text>
                    <View style={styles.chipRow}>
                      {(['ADVERTENCIA', 'SUSPENSAO'] as const).map((p) => (
                        <TouchableOpacity
                          key={p}
                          style={[styles.chip, punicao === p && styles.chipActive]}
                          onPress={() => setPunicao(p)}
                        >
                          <Text style={[styles.chipText, punicao === p && styles.chipTextActive]}>
                            {p === 'ADVERTENCIA' ? 'Advertência' : 'Suspensão'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Field label="Motivo" value={motivo} onChange={setMotivo} styles={styles} colors={colors} multiline />
                  </>
                ) : null}

                {requestType === 'ALTERACAO_FUNCAO_SALARIO' ? (
                  <>
                    <View style={styles.chipRow}>
                      {(['FUNCAO', 'SALARIO'] as const).map((p) => (
                        <TouchableOpacity
                          key={p}
                          style={[styles.chip, tipoAlteracao === p && styles.chipActive]}
                          onPress={() => setTipoAlteracao(p)}
                        >
                          <Text style={[styles.chipText, tipoAlteracao === p && styles.chipTextActive]}>
                            {p === 'FUNCAO' ? 'Função' : 'Salário'}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Field label="Valor antigo" value={funcaoAntigo} onChange={setFuncaoAntigo} styles={styles} colors={colors} />
                    <Field label="Valor novo" value={funcaoNovo} onChange={setFuncaoNovo} styles={styles} colors={colors} />
                    <Field label="Justificativa" value={justificativa} onChange={setJustificativa} styles={styles} colors={colors} multiline />
                  </>
                ) : null}

                {requestType === 'ATESTADO_MEDICO' ? (
                  <>
                    <DateField label="Data inicial" value={dataInicial} onChange={setDataInicial} />
                    <DateField label="Data final" value={dataFinal} onChange={setDataFinal} />
                    <Field label="Nº de dias" value={numeroDias} onChange={setNumeroDias} styles={styles} colors={colors} />
                    <AttachButton
                      label={attachment ? attachment.fileName : 'Anexar atestado'}
                      attached={!!attachment}
                      onPress={async () => setAttachment(await pickAttachment())}
                      styles={styles}
                      colors={colors}
                    />
                  </>
                ) : null}

                {requestType === 'HORA_EXTRA' ? (
                  <>
                    <Field label="Justificativa" value={justificativa} onChange={setJustificativa} styles={styles} colors={colors} multiline />
                    <Field label="Datas" value={datas} onChange={setDatas} styles={styles} colors={colors} />
                    <AttachButton
                      label={attachment ? attachment.fileName : 'Anexar autorização'}
                      attached={!!attachment}
                      onPress={async () => setAttachment(await pickAttachment())}
                      styles={styles}
                      colors={colors}
                    />
                  </>
                ) : null}

                {requestType === 'BENEFICIOS_VIAGEM' ? (
                  <>
                    <DateField label="Data inicial" value={dataInicial} onChange={setDataInicial} />
                    <DateField label="Data final" value={dataFinal} onChange={setDataFinal} />
                    <Field label="Nº de dias" value={numeroDias} onChange={setNumeroDias} styles={styles} colors={colors} />
                    <Field label="Motivo" value={motivo} onChange={setMotivo} styles={styles} colors={colors} />
                  </>
                ) : null}

                {requestType === 'RESCISAO' ? (
                  <>
                    <Field label="Tipo de aviso" value={tipoAviso} onChange={setTipoAviso} styles={styles} colors={colors} />
                    <Field label="Tipo de rescisão" value={tipoRescisao} onChange={setTipoRescisao} styles={styles} colors={colors} />
                    <Field label="Motivo" value={motivo} onChange={setMotivo} styles={styles} colors={colors} multiline />
                  </>
                ) : null}

                {requestType === 'RETIFICACAO_ALOCACAO' ? (
                  <>
                    <DateField label="Data" value={dataInicial} onChange={setDataInicial} />
                    <Field label="Justificativa" value={justificativa} onChange={setJustificativa} styles={styles} colors={colors} multiline />
                  </>
                ) : null}

                {requestType === 'OUTRAS_SOLICITACOES' ? (
                  <>
                    <Field label="Tipo de solicitação" value={tipoSolicitacao} onChange={setTipoSolicitacao} styles={styles} colors={colors} />
                    <Field label="Situação" value={situacao} onChange={setSituacao} styles={styles} colors={colors} />
                    <Field label="Justificativa" value={justificativa} onChange={setJustificativa} styles={styles} colors={colors} multiline />
                    <Field label="Datas (opcional)" value={datas} onChange={setDatas} styles={styles} colors={colors} />
                    <Field label="Valores (opcional)" value={valores} onChange={setValores} styles={styles} colors={colors} />
                  </>
                ) : null}

                {requestType === 'ADM_ASOS' ? (
                  <>
                    <Text style={styles.fieldLabel}>Tipo ASO</Text>
                    <View style={styles.chipRow}>
                      {(
                        [
                          ['ADMISSIONAL', 'Admissional'],
                          ['DEMISSIONAL', 'Demissional'],
                          ['PERIODICO', 'Periódico'],
                          ['ALTERACAO_FUNCAO', 'Alt. função'],
                        ] as const
                      ).map(([v, label]) => (
                        <TouchableOpacity
                          key={v}
                          style={[styles.chip, asoTipo === v && styles.chipActive]}
                          onPress={() => setAsoTipo(v)}
                        >
                          <Text style={[styles.chipText, asoTipo === v && styles.chipTextActive]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Field label="CPF" value={asoCpf} onChange={setAsoCpf} styles={styles} colors={colors} />
                    <DateField label="Nascimento" value={asoNascimento} onChange={setAsoNascimento} />
                    <Field label="Setor" value={asoSetor} onChange={setAsoSetor} styles={styles} colors={colors} />
                    <Field label="Cargo" value={asoCargo} onChange={setAsoCargo} styles={styles} colors={colors} />
                    {asoTipo === 'ALTERACAO_FUNCAO' ? (
                      <Field label="Novo cargo" value={asoNovoCargo} onChange={setAsoNovoCargo} styles={styles} colors={colors} />
                    ) : null}
                    <Field label="Centro de custo" value={asoCentroCusto} onChange={setAsoCentroCusto} styles={styles} colors={colors} />
                    <Field label="Local de trabalho" value={asoLocal} onChange={setAsoLocal} styles={styles} colors={colors} />
                    <Field label="Empresa" value={asoEmpresa} onChange={setAsoEmpresa} styles={styles} colors={colors} />
                  </>
                ) : null}

                <TouchableOpacity
                  style={[styles.primaryBtn, { marginTop: 16, marginBottom: 40 }]}
                  onPress={() => void submitCreate()}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Enviar solicitação</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Type picker */}
      <Modal visible={typePickerOpen} transparent animationType="fade" onRequestClose={() => setTypePickerOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.modalTitle}>Tipo de solicitação</Text>
            <FlatList
              data={typeOptions}
              keyExtractor={(t) => t}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    setRequestType(item);
                    setAttachment(null);
                    setTypePickerOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{DP_TYPE_LABELS[item]}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Contract picker */}
      <Modal visible={contractPickerOpen} transparent animationType="fade" onRequestClose={() => setContractPickerOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.modalTitle}>Contrato</Text>
            {contractsQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <FlatList
                data={contracts}
                keyExtractor={(c) => c.id}
                style={{ maxHeight: 400 }}
                ListEmptyComponent={<Text style={styles.empty}>Nenhum contrato elegível.</Text>}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.optionRow} onPress={() => onPickContract(item)}>
                    <Text style={styles.optionText}>{item.name}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Employee picker */}
      <Modal visible={empPickerOpen} transparent animationType="fade" onRequestClose={() => setEmpPickerOpen(false)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <Text style={styles.modalTitle}>Colaborador</Text>
            <TextInput
              value={empSearch}
              onChangeText={setEmpSearch}
              placeholder="Buscar nome..."
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
            />
            <FlatList
              data={filteredEmployees}
              keyExtractor={(e) => e.id}
              style={{ maxHeight: 360 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.optionRow}
                  onPress={() => {
                    setEmployeeId(item.id);
                    setEmpPickerOpen(false);
                  }}
                >
                  <Text style={styles.optionText}>{item.name}</Text>
                  {item.department ? (
                    <Text style={styles.optionSub}>{item.department}</Text>
                  ) : null}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Info({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof getStyles>;
}) {
  return (
    <View style={styles.infoBlock}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  styles,
  colors,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  styles: ReturnType<typeof getStyles>;
  colors: any;
  multiline?: boolean;
}) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={label}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, multiline && { minHeight: 80, textAlignVertical: 'top' }]}
        multiline={multiline}
      />
    </>
  );
}

function AttachButton({
  label,
  attached,
  onPress,
  styles,
  colors,
}: {
  label: string;
  attached: boolean;
  onPress: () => void;
  styles: ReturnType<typeof getStyles>;
  colors: any;
}) {
  return (
    <TouchableOpacity style={styles.attachBtn} onPress={onPress}>
      <Paperclip size={16} color={attached ? colors.success : colors.primary} />
      <Text style={[styles.attachText, attached && { color: colors.success }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function getStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
    pad: { padding: 16, paddingBottom: 48 },
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
      marginBottom: 16,
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
    empty: { alignItems: 'center', paddingVertical: 56, gap: 8, paddingHorizontal: 24 },
    emptyIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: isDark ? colors.card : colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
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
    cardNumber: {
      fontWeight: '700',
      color: colors.textSecondary,
      fontSize: 13,
      letterSpacing: 0.2,
    },
    badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    cardRoute: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 10,
      letterSpacing: -0.2,
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 4,
    },
    dot: {
      width: 3,
      height: 3,
      borderRadius: 2,
      backgroundColor: colors.textSecondary,
      opacity: 0.5,
    },
    cardMeta: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
    cardSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    cardHint: {
      fontSize: 11,
      fontWeight: '600',
      marginTop: 10,
      letterSpacing: -0.1,
    },
    modalHeaderBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    infoBlock: { marginBottom: 12 },
    infoLabel: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, marginBottom: 2 },
    infoValue: { fontSize: 15, color: colors.text, fontWeight: '500' },
    returnBox: {
      marginTop: 12,
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.surface,
    },
    returnTitle: { fontWeight: '700', color: colors.warning, marginBottom: 10 },
    input: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: 15,
      marginBottom: 10,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      marginBottom: 8,
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      padding: 18,
      paddingBottom: 28,
    },
    optionRow: {
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    optionText: { fontSize: 15, color: colors.text, fontWeight: '500' },
    optionSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: 4,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
    select: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      marginBottom: 10,
      gap: 8,
    },
    selectText: { flex: 1, fontSize: 15, color: colors.text },
    targetCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
    },
    targetTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    targetSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    attachBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    attachText: { flex: 1, color: colors.primary, fontWeight: '600' },
  });
}
