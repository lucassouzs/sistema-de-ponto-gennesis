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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  ChevronRight,
  ArrowLeft,
  Filter,
  Paperclip,
  Search,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import AppHeader from '../components/AppHeader';
import DateField from '../components/DateField';
import { PersonPickerListRow, PersonSelectField } from '../components/PersonPickerUi';
import { formatCpfDisplay } from '../lib/cpf';
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

const COMPANIES_LIST = ['ABRASIL', 'GÊNNESIS', 'MÉTRICA'];
const DEPARTMENTS_LIST = [
  'Projetos',
  'Contratos e Licitações',
  'Suprimentos',
  'Jurídico',
  'Departamento Pessoal',
  'Engenharia',
  'Administrativo',
  'Financeiro',
  'Operacional',
  'Segurança do Trabalho',
  'Sócios',
];

const MOTIVO_CONTRATACAO_OPTIONS = [
  { value: 'AUMENTO_QUADRO', label: 'Aumento de quadro' },
  { value: 'SUBSTITUICAO', label: 'Substituição' },
  { value: 'DEMANDA_TEMPORARIA', label: 'Demanda temporária / obra' },
  { value: 'OUTRO', label: 'Outro' },
] as const;

const TIPO_AVISO_OPTIONS = [
  { value: 'TRABALHADO', label: 'Trabalhado' },
  { value: 'INDENIZADO', label: 'Indenizado' },
  { value: 'PEDIDO_DEMISSAO', label: 'Pedido de demissão' },
  { value: 'OUTRO', label: 'Outro' },
] as const;

const TIPO_RESCISAO_OPTIONS = [
  { value: 'SEM_JUSTA_CAUSA', label: 'Sem justa causa' },
  { value: 'COM_JUSTA_CAUSA', label: 'Com justa causa' },
  { value: 'ACORDO', label: 'Acordo' },
  { value: 'CONTRATO_EXPERIENCIA', label: 'Contrato de experiência' },
  { value: 'OUTRO', label: 'Outro' },
] as const;

type PickerOption = {
  value: string;
  label: string;
  subtitle?: string;
  avatarUri?: string | null;
};

function mapPolo(raw?: string | null): string {
  const s = (raw ?? '').trim();
  if (!s) return '';
  const u = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (u === 'DF' || u === 'BRASILIA' || u.includes('BRASILIA')) return 'DF';
  if (u === 'GO' || u === 'GOIAS' || u.includes('GOIAS')) return 'GO';
  return '';
}

function resolveCostCenterPoloRegion(costCenter?: {
  polo?: string | null;
  name?: string | null;
  code?: string | null;
}): 'DF' | 'GO' | null {
  const fromPolo = mapPolo(costCenter?.polo);
  if (fromPolo === 'DF' || fromPolo === 'GO') return fromPolo;

  const combined = [costCenter?.name, costCenter?.code]
    .map((v) =>
      (v ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
    )
    .filter(Boolean)
    .join(' ');

  if (!combined) return null;
  if (/\bDF\b/.test(combined) || combined.includes('BRASILIA') || combined.includes('DISTRITO FEDERAL')) {
    return 'DF';
  }
  if (/\bGO\b/.test(combined) || combined.includes('GOIAS')) {
    return 'GO';
  }
  return null;
}

function optionLabel(
  options: readonly { value: string; label: string }[],
  value: string
) {
  return options.find((o) => o.value === value)?.label || value;
}

function SelectField({
  label,
  valueLabel,
  placeholder,
  onPress,
  colors,
  isDark,
}: {
  label: string;
  valueLabel: string;
  placeholder: string;
  onPress: () => void;
  colors: any;
  isDark: boolean;
}) {
  const filled = !!valueLabel;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '600',
          color: colors.textSecondary,
          marginBottom: 8,
          letterSpacing: -0.1,
        }}
      >
        {label}
      </Text>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        style={{
          backgroundColor: isDark ? colors.card : colors.surface,
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 15,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          borderWidth: StyleSheet.hairlineWidth * 1.5,
          borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
        }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: 15,
            fontWeight: filled ? '600' : '500',
            color: filled ? colors.text : colors.textSecondary,
            letterSpacing: -0.2,
          }}
          numberOfLines={1}
        >
          {valueLabel || placeholder}
        </Text>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.2} />
        </View>
      </TouchableOpacity>
    </View>
  );
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

const MAX_SOLICITACAO_ITENS = 20;
const MAX_ADMISSAO_CANDIDATOS = 30;

type FormRow = {
  employeeId: string;
  nome: string;
  funcao: string;
  contato: string;
  setor: string;
  motivoContratacao: string;
  observacao: string;
  detalhes: string;
  motivo: string;
  dataInicial: string;
  dataFinal: string;
  numeroDias: string;
  justificativa: string;
  datas: string;
  tipoSolicitacao: string;
  situacao: string;
  valores: string;
  observacoes: string;
  punicao: 'ADVERTENCIA' | 'SUSPENSAO';
  tipoAviso: string;
  tipoRescisao: string;
  funcaoAntigo: string;
  funcaoNovo: string;
  tipoAlteracao: 'FUNCAO' | 'SALARIO';
  cidade: string;
  pedagio: 'SIM' | 'NAO';
  diasHotel: string;
  asoTipo: 'ADMISSIONAL' | 'DEMISSIONAL' | 'PERIODICO' | 'ALTERACAO_FUNCAO';
  asoCpf: string;
  asoNascimento: string;
  asoSetor: string;
  asoCargo: string;
  asoNovoCargo: string;
  asoCentroCusto: string;
  asoLocal: string;
  asoEmpresa: string;
  seguirPcmso: 'SIM' | 'NAO';
  attachment: Attachment | null;
};

function emptyFormRow(employeeId = ''): FormRow {
  return {
    employeeId,
    nome: '',
    funcao: '',
    contato: '',
    setor: '',
    motivoContratacao: '',
    observacao: '',
    detalhes: '',
    motivo: '',
    dataInicial: '',
    dataFinal: '',
    numeroDias: '',
    justificativa: '',
    datas: '',
    tipoSolicitacao: '',
    situacao: '',
    valores: '',
    observacoes: '',
    punicao: 'ADVERTENCIA',
    tipoAviso: '',
    tipoRescisao: '',
    funcaoAntigo: '',
    funcaoNovo: '',
    tipoAlteracao: 'FUNCAO',
    cidade: '',
    pedagio: 'NAO',
    diasHotel: '',
    asoTipo: 'ADMISSIONAL',
    asoCpf: '',
    asoNascimento: '',
    asoSetor: '',
    asoCargo: '',
    asoNovoCargo: '',
    asoCentroCusto: '',
    asoLocal: '',
    asoEmpresa: '',
    seguirPcmso: 'SIM',
    attachment: null,
  };
}

function itemCardTitle(requestType: DpRequestType | '', index: number) {
  if (requestType === 'ADMISSAO') return `Pessoa ${index + 1}`;
  return `Item ${index + 1}`;
}

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
  const insets = useSafeAreaInsets();
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
  const [rows, setRows] = useState<FormRow[]>(() => [emptyFormRow(myEmployeeId)]);

  const [picker, setPicker] = useState<{
    title: string;
    options: PickerOption[];
    onSelect: (value: string) => void;
  } | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

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

  const selectedContract = contracts.find((c) => c.id === contractId);

  const maxRows =
    requestType === 'ADMISSAO' ? MAX_ADMISSAO_CANDIDATOS : MAX_SOLICITACAO_ITENS;

  const resetCreateFields = () => {
    setUrgency('MEDIUM');
    setRequestType('');
    setContractId('');
    setCompany('');
    setPolo('');
    setPrazoInicio('');
    setPrazoFim('');
    setRows([emptyFormRow(myEmployeeId)]);
  };

  const updateRow = (index: number, patch: Partial<FormRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addRow = () => {
    setRows((prev) => {
      if (prev.length >= maxRows) return prev;
      return [
        ...prev,
        emptyFormRow(requestType === 'ADMISSAO' ? '' : myEmployeeId),
      ];
    });
  };

  const removeRow = (index: number) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const employeeOptionsForRow = (index: number): PickerOption[] => {
    const used = rows
      .map((row, i) => (i !== index ? row.employeeId : ''))
      .filter(Boolean);
    const current = rows[index]?.employeeId ?? '';
    return employees
      .filter((e) => e.id === current || !used.includes(e.id))
      .map((e) => ({
        value: e.id,
        label: e.name,
        subtitle: formatCpfDisplay(e.cpf) || e.department || undefined,
        avatarUri: e.profilePhotoUrl ?? null,
      }));
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
    setCompany(c.costCenter?.company?.trim() || '');
    setPolo(resolveCostCenterPoloRegion(c.costCenter) ?? '');
  };

  const showPoloField = useMemo(
    () => resolveCostCenterPoloRegion(selectedContract?.costCenter) !== null,
    [selectedContract]
  );

  const companyOptions = useMemo(() => {
    const items = COMPANIES_LIST.map((c) => ({ value: c, label: c }));
    if (company && !COMPANIES_LIST.includes(company)) {
      return [{ value: company, label: company }, ...items];
    }
    return items;
  }, [company]);

  const openPicker = (
    title: string,
    options: PickerOption[],
    onSelect: (value: string) => void
  ) => {
    setPickerSearch('');
    setPicker({ title, options, onSelect });
  };

  const pickerFiltered = useMemo(() => {
    if (!picker) return [];
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return picker.options;
    return picker.options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.subtitle || '').toLowerCase().includes(q)
    );
  }, [picker, pickerSearch]);

  const buildDetails = (): Record<string, unknown> => {
    if (!requestType) throw new Error('Selecione o tipo');
    if (!rows.length) throw new Error('Adicione ao menos um item');

    if (requestType === 'ADMISSAO') {
      const candidatos = rows.map((row, i) => {
        if (!row.nome.trim() || !row.funcao.trim() || !row.contato.trim()) {
          throw new Error(`Pessoa ${i + 1}: preencha nome, função e contato`);
        }
        if (!row.motivoContratacao.trim() || !row.setor.trim()) {
          throw new Error(`Pessoa ${i + 1}: informe motivo e setor`);
        }
        return {
          nome: row.nome.trim(),
          funcao: row.funcao.trim(),
          contato: row.contato.trim(),
          motivoContratacao: row.motivoContratacao.trim(),
          setor: row.setor.trim(),
          observacao: row.observacao.trim() || undefined,
        };
      });
      return { candidatos };
    }

    const requireEmp = (row: FormRow, i: number) => {
      const emp = row.employeeId || myEmployeeId;
      if (!emp) throw new Error(`Item ${i + 1}: selecione o colaborador`);
      return emp;
    };

    if ((ADM_SIMPLE_TYPES as readonly string[]).includes(requestType)) {
      return {
        itens: rows.map((row, i) => {
          if (!row.detalhes.trim()) throw new Error(`Item ${i + 1}: descreva os detalhes`);
          return { employeeId: requireEmp(row, i), detalhes: row.detalhes.trim() };
        }),
      };
    }

    if (requestType === 'ADM_VIAGENS') {
      return {
        viagens: rows.map((row, i) => {
          if (
            !row.dataInicial ||
            !row.dataFinal ||
            !row.cidade.trim() ||
            !row.motivo.trim() ||
            !row.numeroDias.trim()
          ) {
            throw new Error(`Item ${i + 1}: preencha datas, cidade, motivo e nº de dias`);
          }
          return {
            employeeId: requireEmp(row, i),
            dataIda: row.dataInicial,
            dataVolta: row.dataFinal,
            cidade: row.cidade.trim(),
            motivoViagem: row.motivo.trim(),
            numeroDias: row.numeroDias.trim(),
            pedagio: row.pedagio,
            observacoes: row.observacoes.trim() || undefined,
          };
        }),
      };
    }

    if (requestType === 'ADM_ASOS') {
      return {
        asos: rows.map((row, i) => {
          if (
            !row.asoCpf.trim() ||
            !row.asoNascimento ||
            !row.asoSetor.trim() ||
            !row.asoCargo.trim() ||
            !row.asoCentroCusto.trim() ||
            !row.asoLocal.trim() ||
            !row.asoEmpresa.trim()
          ) {
            throw new Error(`Item ${i + 1}: preencha todos os campos do ASO`);
          }
          if (row.asoTipo === 'ALTERACAO_FUNCAO' && !row.asoNovoCargo.trim()) {
            throw new Error(`Item ${i + 1}: informe o novo cargo`);
          }
          return {
            asoTipo: row.asoTipo,
            employeeId: requireEmp(row, i),
            dataNascimento: row.asoNascimento,
            cpf: row.asoCpf.trim(),
            setor: row.asoSetor.trim(),
            cargo: row.asoCargo.trim(),
            novoCargo: row.asoNovoCargo.trim() || undefined,
            centroCusto: row.asoCentroCusto.trim(),
            localTrabalho: row.asoLocal.trim(),
            empresa: row.asoEmpresa.trim(),
            seguirPcmso: row.seguirPcmso,
          };
        }),
      };
    }

    if (requestType === 'FERIAS') {
      return {
        ferias: rows.map((row, i) => {
          if (!row.dataInicial || !row.dataFinal) {
            throw new Error(`Item ${i + 1}: informe o período de férias`);
          }
          return {
            employeeId: requireEmp(row, i),
            dataInicial: row.dataInicial,
            dataFinal: row.dataFinal,
            observacao: row.observacoes.trim() || undefined,
          };
        }),
      };
    }

    if (requestType === 'ADVERTENCIA_SUSPENSAO') {
      return {
        medidas: rows.map((row, i) => {
          if (!row.motivo.trim()) throw new Error(`Item ${i + 1}: informe o motivo`);
          return {
            employeeId: requireEmp(row, i),
            punicao: row.punicao,
            motivo: row.motivo.trim(),
          };
        }),
      };
    }

    if (requestType === 'ALTERACAO_FUNCAO_SALARIO') {
      return {
        alteracoes: rows.map((row, i) => {
          if (!row.funcaoAntigo.trim() || !row.funcaoNovo.trim() || !row.justificativa.trim()) {
            throw new Error(`Item ${i + 1}: preencha valores antigo/novo e justificativa`);
          }
          return {
            employeeId: requireEmp(row, i),
            tipoAlteracaoFuncaoOuSalario: row.tipoAlteracao,
            funcaoSalarioAntigo: row.funcaoAntigo.trim(),
            funcaoSalarioNovo: row.funcaoNovo.trim(),
            justificativa: row.justificativa.trim(),
          };
        }),
      };
    }

    if (requestType === 'ATESTADO_MEDICO') {
      return {
        atestados: rows.map((row, i) => {
          if (!row.dataInicial || !row.dataFinal || !row.numeroDias.trim()) {
            throw new Error(`Item ${i + 1}: informe o período e o nº de dias`);
          }
          if (!row.attachment) throw new Error(`Item ${i + 1}: anexe o atestado`);
          return {
            employeeId: requireEmp(row, i),
            dataInicial: row.dataInicial,
            dataFinal: row.dataFinal,
            numeroDias: row.numeroDias.trim(),
            anexoAtestado: row.attachment,
          };
        }),
      };
    }

    if (requestType === 'HORA_EXTRA') {
      return {
        horasExtras: rows.map((row, i) => {
          if (!row.justificativa.trim() || !row.dataInicial || !row.dataFinal) {
            throw new Error(`Item ${i + 1}: informe justificativa e o período`);
          }
          if (!row.attachment) throw new Error(`Item ${i + 1}: anexe a autorização`);
          return {
            employeeId: requireEmp(row, i),
            justificativa: row.justificativa.trim(),
            datas: `${row.dataInicial} - ${row.dataFinal}`,
            anexoAutorizacao: row.attachment,
          };
        }),
      };
    }

    if (requestType === 'BENEFICIOS_VIAGEM') {
      return {
        viagensBeneficio: rows.map((row, i) => {
          if (!row.dataInicial || !row.dataFinal || !row.numeroDias.trim() || !row.motivo.trim()) {
            throw new Error(`Item ${i + 1}: preencha período, dias e motivo`);
          }
          return {
            employeeId: requireEmp(row, i),
            dataInicial: row.dataInicial,
            dataFinal: row.dataFinal,
            numeroDias: row.numeroDias.trim(),
            motivoViagem: row.motivo.trim(),
            diasHotel: row.diasHotel.trim() || undefined,
          };
        }),
      };
    }

    if (requestType === 'RESCISAO') {
      return {
        rescisoes: rows.map((row, i) => {
          if (!row.tipoAviso.trim() || !row.tipoRescisao.trim() || !row.motivo.trim()) {
            throw new Error(`Item ${i + 1}: preencha tipo de aviso, rescisão e motivo`);
          }
          return {
            employeeId: requireEmp(row, i),
            tipoAviso: row.tipoAviso.trim(),
            tipoRescisao: row.tipoRescisao.trim(),
            motivo: row.motivo.trim(),
            observacoes: row.observacoes.trim() || undefined,
          };
        }),
      };
    }

    if (requestType === 'RETIFICACAO_ALOCACAO') {
      return {
        retificacoes: rows.map((row, i) => {
          if (!row.dataInicial || !row.justificativa.trim()) {
            throw new Error(`Item ${i + 1}: informe a data e a justificativa`);
          }
          return {
            employeeId: requireEmp(row, i),
            data: row.dataInicial,
            justificativa: row.justificativa.trim(),
          };
        }),
      };
    }

    if (requestType === 'OUTRAS_SOLICITACOES') {
      return {
        itens: rows.map((row, i) => {
          if (!row.tipoSolicitacao.trim() || !row.situacao.trim() || !row.justificativa.trim()) {
            throw new Error(`Item ${i + 1}: preencha tipo, situação e justificativa`);
          }
          return {
            employeeId: requireEmp(row, i),
            tipoSolicitacao: row.tipoSolicitacao.trim(),
            situacao: row.situacao.trim(),
            justificativa: row.justificativa.trim(),
            datas: row.datas.trim() || undefined,
            valores: row.valores.trim() || undefined,
            observacoes: row.observacoes.trim() || undefined,
          };
        }),
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

  return (
    <View style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader
        showBack={!isTabScreen}
        title={!isTabScreen ? 'Solicitações Internas' : undefined}
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
          <Text style={styles.pageTitle}>Solicitações Internas</Text>
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
              ? 'Minhas Solicitações'
              : filterChips.find((c) => c.key === destFilter)?.label || 'Minhas Solicitações'}
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
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <View style={styles.pickerOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setFilterOpen(false)}
          />
          <View style={[styles.pickerSheet, { backgroundColor: colors.background }]}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Filtro de status</Text>
              <TouchableOpacity
                onPress={() => setFilterOpen(false)}
                style={[styles.formCloseBtn, { width: 36, height: 36 }]}
                accessibilityLabel="Fechar"
              >
                <X size={18} color={colors.text} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ maxHeight: 420 }}
              contentContainerStyle={{ paddingBottom: 24, gap: 8 }}
              showsVerticalScrollIndicator={false}
            >
              <TouchableOpacity
                style={[
                  styles.pickerItem,
                  { backgroundColor: isDark ? colors.card : colors.surface },
                ]}
                onPress={() => {
                  setStatusFilter('all');
                  setFilterOpen(false);
                }}
              >
                <Text style={styles.pickerItemLabel}>Todos</Text>
              </TouchableOpacity>
              {(Object.keys(STATUS_LABELS) as DpRequestStatus[]).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.pickerItem,
                    { backgroundColor: isDark ? colors.card : colors.surface },
                  ]}
                  onPress={() => {
                    setStatusFilter(s);
                    setFilterOpen(false);
                  }}
                >
                  <Text style={styles.pickerItemLabel}>{STATUS_LABELS[s]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Create */}
      <Modal
        visible={createOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => setCreateOpen(false)}
      >
        <View
          style={[
            styles.safeArea,
            {
              backgroundColor: colors.background,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
            },
          ]}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.formHeader}>
              <View style={styles.formHeaderText}>
                {createTarget ? (
                  <TouchableOpacity
                    onPress={() => {
                      setCreateTarget(null);
                      setRequestType('');
                      setRows([emptyFormRow(myEmployeeId)]);
                    }}
                    style={styles.formBackRow}
                    hitSlop={6}
                  >
                    <ArrowLeft size={18} color={colors.primary} strokeWidth={2.2} />
                    <Text style={styles.formBackText}>Trocar destino</Text>
                  </TouchableOpacity>
                ) : null}
                <Text style={styles.formTitle}>Nova solicitação</Text>
                <Text style={styles.formSubtitle}>
                  {!createTarget
                    ? 'Selecione o destino da solicitação'
                    : createTarget === 'DP'
                      ? 'Departamento Pessoal'
                      : 'ADM/TST'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCreateOpen(false)}
                style={styles.formCloseBtn}
                hitSlop={6}
                accessibilityLabel="Fechar"
              >
                <X size={20} color={colors.text} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            {!createTarget ? (
              <ScrollView
                contentContainerStyle={styles.formScroll}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.sectionTitle}>Destino</Text>
                <TouchableOpacity
                  style={styles.targetCard}
                  onPress={() => {
                    setCreateTarget('DP');
                    setRequestType('');
                    setRows([emptyFormRow(myEmployeeId)]);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.targetIcon, { backgroundColor: `${colors.primary}14` }]}>
                    <Users size={20} color={colors.primary} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.targetTitle}>Departamento Pessoal</Text>
                    <Text style={styles.targetSub}>Admissão, férias, atestado, etc.</Text>
                  </View>
                  <ChevronRight size={18} color={colors.textSecondary} strokeWidth={2.2} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.targetCard}
                  onPress={() => {
                    setCreateTarget('ADM_TST');
                    setRequestType('');
                    setRows([emptyFormRow(myEmployeeId)]);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.targetIcon, { backgroundColor: `${colors.primary}14` }]}>
                    <ClipboardList size={20} color={colors.primary} strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.targetTitle}>ADM/TST</Text>
                    <Text style={styles.targetSub}>Viagens, EPI, material, informática…</Text>
                  </View>
                  <ChevronRight size={18} color={colors.textSecondary} strokeWidth={2.2} />
                </TouchableOpacity>
              </ScrollView>
            ) : (
              <>
                <ScrollView
                  contentContainerStyle={styles.formScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.sectionTitle}>Dados gerais</Text>

                  <Text style={styles.fieldLabel}>Urgência</Text>
                  <View style={styles.segRow}>
                    {(['MEDIUM', 'URGENT'] as DpUrgency[]).map((u) => (
                      <TouchableOpacity
                        key={u}
                        style={[styles.segBtn, urgency === u && styles.segBtnActive]}
                        onPress={() => setUrgency(u)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.segText, urgency === u && styles.segTextActive]}>
                          {URGENCY_LABELS[u]}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <SelectField
                    label="Tipo"
                    valueLabel={requestType ? DP_TYPE_LABELS[requestType] : ''}
                    placeholder="Selecionar tipo"
                    colors={colors}
                    isDark={isDark}
                    onPress={() =>
                      openPicker(
                        'Tipo de solicitação',
                        typeOptions.map((t) => ({
                          value: t,
                          label: DP_TYPE_LABELS[t],
                        })),
                        (v) => {
                          setRequestType(v as DpRequestType);
                          setRows([
                            emptyFormRow(v === 'ADMISSAO' ? '' : myEmployeeId),
                          ]);
                        }
                      )
                    }
                  />

                  <SelectField
                    label="Contrato"
                    valueLabel={selectedContract?.name || ''}
                    placeholder="Selecionar contrato"
                    colors={colors}
                    isDark={isDark}
                    onPress={() =>
                      openPicker(
                        'Contrato',
                        contracts.map((c) => ({
                          value: c.id,
                          label: c.name,
                          subtitle: c.number || undefined,
                        })),
                        (id) => {
                          const c = contracts.find((x) => x.id === id);
                          if (c) onPickContract(c);
                        }
                      )
                    }
                  />

                  <SelectField
                    label="Empresa"
                    valueLabel={company}
                    placeholder="Selecionar empresa"
                    colors={colors}
                    isDark={isDark}
                    onPress={() =>
                      openPicker('Empresa', companyOptions, (v) => setCompany(v))
                    }
                  />

                  {showPoloField ? (
                    <SelectField
                      label="Polo"
                      valueLabel={polo}
                      placeholder="Selecionar polo"
                      colors={colors}
                      isDark={isDark}
                      onPress={() =>
                        openPicker(
                          'Polo',
                          [
                            {
                              value: resolveCostCenterPoloRegion(selectedContract?.costCenter) || polo || 'DF',
                              label:
                                resolveCostCenterPoloRegion(selectedContract?.costCenter) ||
                                polo ||
                                'DF',
                            },
                          ],
                          (v) => setPolo(v)
                        )
                      }
                    />
                  ) : null}

                  <DateField
                    label="Prazo início (retorno)"
                    value={prazoInicio}
                    onChange={setPrazoInicio}
                    placeholder="Selecionar data"
                  />
                  <DateField
                    label="Prazo fim (retorno)"
                    value={prazoFim}
                    onChange={setPrazoFim}
                    placeholder="Selecionar data"
                  />

                  {requestType ? (
                    <Text style={styles.sectionTitle}>Detalhes da solicitação</Text>
                  ) : null}

                  {requestType
                    ? rows.map((row, index) => {
                        const selectedEmployee = employees.find((e) => e.id === row.employeeId);
                        const empLabel =
                          selectedEmployee?.name ||
                          (row.employeeId ? 'Colaborador selecionado' : '');
                        return (
                          <View key={`row-${index}`} style={styles.itemCard}>
                            <View style={styles.itemCardHeader}>
                              <Text style={styles.itemCardTitle}>
                                {itemCardTitle(requestType, index)}
                              </Text>
                              {rows.length > 1 ? (
                                <TouchableOpacity
                                  onPress={() => removeRow(index)}
                                  hitSlop={8}
                                  accessibilityLabel="Remover item"
                                >
                                  <X size={18} color={colors.error || '#ef4444'} strokeWidth={2.2} />
                                </TouchableOpacity>
                              ) : null}
                            </View>

                            {requestType !== 'ADMISSAO' ? (
                              <PersonSelectField
                                label="Colaborador"
                                valueLabel={empLabel}
                                valueSubtitle={
                                  selectedEmployee
                                    ? formatCpfDisplay(selectedEmployee.cpf) || undefined
                                    : undefined
                                }
                                valueAvatarUri={selectedEmployee?.profilePhotoUrl}
                                placeholder="Selecionar colaborador"
                                colors={colors}
                                isDark={isDark}
                                onPress={() =>
                                  openPicker(
                                    'Colaborador',
                                    employeeOptionsForRow(index),
                                    (id) => {
                                      const item = employees.find((e) => e.id === id);
                                      const patch: Partial<FormRow> = { employeeId: id };
                                      if (item && requestType === 'ADM_ASOS') {
                                        patch.asoCpf = item.cpf || '';
                                        patch.asoNascimento = item.birthDate
                                          ? String(item.birthDate).slice(0, 10)
                                          : '';
                                        patch.asoSetor = item.department || '';
                                        patch.asoCargo = item.position || '';
                                        patch.asoCentroCusto = item.costCenter || '';
                                        patch.asoEmpresa = item.company || company || '';
                                        patch.asoLocal = item.polo || polo || '';
                                      }
                                      updateRow(index, patch);
                                    }
                                  )
                                }
                              />
                            ) : null}

                            {requestType === 'ADMISSAO' ? (
                              <>
                                <Field
                                  label="Nome do candidato"
                                  value={row.nome}
                                  onChange={(nome) => updateRow(index, { nome })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                <Field
                                  label="Função"
                                  value={row.funcao}
                                  onChange={(funcao) => updateRow(index, { funcao })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                <Field
                                  label="Contato"
                                  value={row.contato}
                                  onChange={(contato) => updateRow(index, { contato })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                <SelectField
                                  label="Setor"
                                  valueLabel={row.setor}
                                  placeholder="Selecionar setor"
                                  colors={colors}
                                  isDark={isDark}
                                  onPress={() =>
                                    openPicker(
                                      'Setor',
                                      DEPARTMENTS_LIST.map((d) => ({ value: d, label: d })),
                                      (setor) => updateRow(index, { setor })
                                    )
                                  }
                                />
                                <SelectField
                                  label="Motivo da contratação"
                                  valueLabel={optionLabel(
                                    MOTIVO_CONTRATACAO_OPTIONS,
                                    row.motivoContratacao
                                  )}
                                  placeholder="Selecionar motivo"
                                  colors={colors}
                                  isDark={isDark}
                                  onPress={() =>
                                    openPicker(
                                      'Motivo da contratação',
                                      MOTIVO_CONTRATACAO_OPTIONS.map((o) => ({
                                        value: o.value,
                                        label: o.label,
                                      })),
                                      (motivoContratacao) =>
                                        updateRow(index, { motivoContratacao })
                                    )
                                  }
                                />
                                <Field
                                  label="Observação"
                                  value={row.observacao}
                                  onChange={(observacao) => updateRow(index, { observacao })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                  multiline
                                />
                              </>
                            ) : null}

                            {(ADM_SIMPLE_TYPES as readonly string[]).includes(requestType) ? (
                              <Field
                                label="Detalhes"
                                value={row.detalhes}
                                onChange={(detalhes) => updateRow(index, { detalhes })}
                                styles={styles}
                                colors={colors}
                                isDark={isDark}
                                multiline
                              />
                            ) : null}

                            {requestType === 'ADM_VIAGENS' ? (
                              <>
                                <DateField
                                  label="Data ida"
                                  value={row.dataInicial}
                                  onChange={(dataInicial) => updateRow(index, { dataInicial })}
                                />
                                <DateField
                                  label="Data volta"
                                  value={row.dataFinal}
                                  onChange={(dataFinal) => updateRow(index, { dataFinal })}
                                />
                                <Field
                                  label="Cidade"
                                  value={row.cidade}
                                  onChange={(cidade) => updateRow(index, { cidade })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                <Field
                                  label="Motivo"
                                  value={row.motivo}
                                  onChange={(motivo) => updateRow(index, { motivo })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                <Field
                                  label="Nº de dias"
                                  value={row.numeroDias}
                                  onChange={(numeroDias) => updateRow(index, { numeroDias })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                  keyboardType="number-pad"
                                />
                                <Text style={styles.fieldLabel}>Pedágio</Text>
                                <View style={styles.segRow}>
                                  {(['SIM', 'NAO'] as const).map((p) => (
                                    <TouchableOpacity
                                      key={p}
                                      style={[styles.segBtn, row.pedagio === p && styles.segBtnActive]}
                                      onPress={() => updateRow(index, { pedagio: p })}
                                    >
                                      <Text
                                        style={[
                                          styles.segText,
                                          row.pedagio === p && styles.segTextActive,
                                        ]}
                                      >
                                        {p === 'SIM' ? 'Sim' : 'Não'}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </>
                            ) : null}

                            {requestType === 'FERIAS' ? (
                              <>
                                <DateField
                                  label="Data inicial"
                                  value={row.dataInicial}
                                  onChange={(dataInicial) => updateRow(index, { dataInicial })}
                                />
                                <DateField
                                  label="Data final"
                                  value={row.dataFinal}
                                  onChange={(dataFinal) => updateRow(index, { dataFinal })}
                                />
                                <Field
                                  label="Observação"
                                  value={row.observacoes}
                                  onChange={(observacoes) => updateRow(index, { observacoes })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                  multiline
                                />
                              </>
                            ) : null}

                            {requestType === 'ADVERTENCIA_SUSPENSAO' ? (
                              <>
                                <Text style={styles.fieldLabel}>Punição</Text>
                                <View style={styles.segRow}>
                                  {(['ADVERTENCIA', 'SUSPENSAO'] as const).map((p) => (
                                    <TouchableOpacity
                                      key={p}
                                      style={[styles.segBtn, row.punicao === p && styles.segBtnActive]}
                                      onPress={() => updateRow(index, { punicao: p })}
                                    >
                                      <Text
                                        style={[
                                          styles.segText,
                                          row.punicao === p && styles.segTextActive,
                                        ]}
                                      >
                                        {p === 'ADVERTENCIA' ? 'Advertência' : 'Suspensão'}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                                <Field
                                  label="Motivo"
                                  value={row.motivo}
                                  onChange={(motivo) => updateRow(index, { motivo })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                  multiline
                                />
                              </>
                            ) : null}

                            {requestType === 'ALTERACAO_FUNCAO_SALARIO' ? (
                              <>
                                <Text style={styles.fieldLabel}>Tipo de alteração</Text>
                                <View style={styles.segRow}>
                                  {(['FUNCAO', 'SALARIO'] as const).map((p) => (
                                    <TouchableOpacity
                                      key={p}
                                      style={[
                                        styles.segBtn,
                                        row.tipoAlteracao === p && styles.segBtnActive,
                                      ]}
                                      onPress={() => updateRow(index, { tipoAlteracao: p })}
                                    >
                                      <Text
                                        style={[
                                          styles.segText,
                                          row.tipoAlteracao === p && styles.segTextActive,
                                        ]}
                                      >
                                        {p === 'FUNCAO' ? 'Função' : 'Salário'}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                                <Field
                                  label="Valor antigo"
                                  value={row.funcaoAntigo}
                                  onChange={(funcaoAntigo) => updateRow(index, { funcaoAntigo })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                <Field
                                  label="Valor novo"
                                  value={row.funcaoNovo}
                                  onChange={(funcaoNovo) => updateRow(index, { funcaoNovo })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                <Field
                                  label="Justificativa"
                                  value={row.justificativa}
                                  onChange={(justificativa) => updateRow(index, { justificativa })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                  multiline
                                />
                              </>
                            ) : null}

                            {requestType === 'ATESTADO_MEDICO' ? (
                              <>
                                <DateField
                                  label="Data inicial"
                                  value={row.dataInicial}
                                  onChange={(dataInicial) => updateRow(index, { dataInicial })}
                                />
                                <DateField
                                  label="Data final"
                                  value={row.dataFinal}
                                  onChange={(dataFinal) => updateRow(index, { dataFinal })}
                                />
                                <Field
                                  label="Nº de dias"
                                  value={row.numeroDias}
                                  onChange={(numeroDias) => updateRow(index, { numeroDias })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                  keyboardType="number-pad"
                                />
                                <AttachButton
                                  label={
                                    row.attachment
                                      ? row.attachment.fileName
                                      : 'Anexar atestado'
                                  }
                                  attached={!!row.attachment}
                                  onPress={async () => {
                                    const file = await pickAttachment();
                                    if (file) updateRow(index, { attachment: file });
                                  }}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                              </>
                            ) : null}

                            {requestType === 'HORA_EXTRA' ? (
                              <>
                                <Field
                                  label="Justificativa"
                                  value={row.justificativa}
                                  onChange={(justificativa) => updateRow(index, { justificativa })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                  multiline
                                />
                                <DateField
                                  label="Início do período"
                                  value={row.dataInicial}
                                  onChange={(dataInicial) => updateRow(index, { dataInicial })}
                                />
                                <DateField
                                  label="Fim do período"
                                  value={row.dataFinal}
                                  onChange={(dataFinal) => updateRow(index, { dataFinal })}
                                />
                                <AttachButton
                                  label={
                                    row.attachment
                                      ? row.attachment.fileName
                                      : 'Anexar autorização'
                                  }
                                  attached={!!row.attachment}
                                  onPress={async () => {
                                    const file = await pickAttachment();
                                    if (file) updateRow(index, { attachment: file });
                                  }}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                              </>
                            ) : null}

                            {requestType === 'BENEFICIOS_VIAGEM' ? (
                              <>
                                <DateField
                                  label="Data inicial"
                                  value={row.dataInicial}
                                  onChange={(dataInicial) => updateRow(index, { dataInicial })}
                                />
                                <DateField
                                  label="Data final"
                                  value={row.dataFinal}
                                  onChange={(dataFinal) => updateRow(index, { dataFinal })}
                                />
                                <Field
                                  label="Nº de dias"
                                  value={row.numeroDias}
                                  onChange={(numeroDias) => updateRow(index, { numeroDias })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                  keyboardType="number-pad"
                                />
                                <Field
                                  label="Hotel (opcional)"
                                  value={row.diasHotel}
                                  onChange={(diasHotel) => updateRow(index, { diasHotel })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                  keyboardType="number-pad"
                                  placeholder="Nº de diárias"
                                />
                                <Field
                                  label="Motivo"
                                  value={row.motivo}
                                  onChange={(motivo) => updateRow(index, { motivo })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                              </>
                            ) : null}

                            {requestType === 'RESCISAO' ? (
                              <>
                                <SelectField
                                  label="Tipo de aviso"
                                  valueLabel={optionLabel(TIPO_AVISO_OPTIONS, row.tipoAviso)}
                                  placeholder="Selecionar tipo de aviso"
                                  colors={colors}
                                  isDark={isDark}
                                  onPress={() =>
                                    openPicker(
                                      'Tipo de aviso',
                                      TIPO_AVISO_OPTIONS.map((o) => ({
                                        value: o.value,
                                        label: o.label,
                                      })),
                                      (tipoAviso) => updateRow(index, { tipoAviso })
                                    )
                                  }
                                />
                                <SelectField
                                  label="Tipo de rescisão"
                                  valueLabel={optionLabel(TIPO_RESCISAO_OPTIONS, row.tipoRescisao)}
                                  placeholder="Selecionar tipo de rescisão"
                                  colors={colors}
                                  isDark={isDark}
                                  onPress={() =>
                                    openPicker(
                                      'Tipo de rescisão',
                                      TIPO_RESCISAO_OPTIONS.map((o) => ({
                                        value: o.value,
                                        label: o.label,
                                      })),
                                      (tipoRescisao) => updateRow(index, { tipoRescisao })
                                    )
                                  }
                                />
                                <Field
                                  label="Motivo"
                                  value={row.motivo}
                                  onChange={(motivo) => updateRow(index, { motivo })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                  multiline
                                />
                                <Field
                                  label="Observações"
                                  value={row.observacoes}
                                  onChange={(observacoes) => updateRow(index, { observacoes })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                  multiline
                                />
                              </>
                            ) : null}

                            {requestType === 'RETIFICACAO_ALOCACAO' ? (
                              <>
                                <DateField
                                  label="Data"
                                  value={row.dataInicial}
                                  onChange={(dataInicial) => updateRow(index, { dataInicial })}
                                />
                                <Field
                                  label="Justificativa"
                                  value={row.justificativa}
                                  onChange={(justificativa) => updateRow(index, { justificativa })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                  multiline
                                />
                              </>
                            ) : null}

                            {requestType === 'OUTRAS_SOLICITACOES' ? (
                              <>
                                <Field
                                  label="Tipo de solicitação"
                                  value={row.tipoSolicitacao}
                                  onChange={(tipoSolicitacao) =>
                                    updateRow(index, { tipoSolicitacao })
                                  }
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                <Field
                                  label="Situação"
                                  value={row.situacao}
                                  onChange={(situacao) => updateRow(index, { situacao })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                <Field
                                  label="Justificativa"
                                  value={row.justificativa}
                                  onChange={(justificativa) => updateRow(index, { justificativa })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                  multiline
                                />
                                <Field
                                  label="Datas (opcional)"
                                  value={row.datas}
                                  onChange={(datas) => updateRow(index, { datas })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                <Field
                                  label="Valores (opcional)"
                                  value={row.valores}
                                  onChange={(valores) => updateRow(index, { valores })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
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
                                      style={[styles.chip, row.asoTipo === v && styles.chipActive]}
                                      onPress={() => updateRow(index, { asoTipo: v })}
                                    >
                                      <Text
                                        style={[
                                          styles.chipText,
                                          row.asoTipo === v && styles.chipTextActive,
                                        ]}
                                      >
                                        {label}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                                <Field
                                  label="CPF"
                                  value={row.asoCpf}
                                  onChange={(asoCpf) => updateRow(index, { asoCpf })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                  keyboardType="number-pad"
                                />
                                <DateField
                                  label="Nascimento"
                                  value={row.asoNascimento}
                                  onChange={(asoNascimento) =>
                                    updateRow(index, { asoNascimento })
                                  }
                                />
                                <Field
                                  label="Setor"
                                  value={row.asoSetor}
                                  onChange={(asoSetor) => updateRow(index, { asoSetor })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                <Field
                                  label="Cargo"
                                  value={row.asoCargo}
                                  onChange={(asoCargo) => updateRow(index, { asoCargo })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                {row.asoTipo === 'ALTERACAO_FUNCAO' ? (
                                  <Field
                                    label="Novo cargo"
                                    value={row.asoNovoCargo}
                                    onChange={(asoNovoCargo) =>
                                      updateRow(index, { asoNovoCargo })
                                    }
                                    styles={styles}
                                    colors={colors}
                                    isDark={isDark}
                                  />
                                ) : null}
                                <Field
                                  label="Centro de custo"
                                  value={row.asoCentroCusto}
                                  onChange={(asoCentroCusto) =>
                                    updateRow(index, { asoCentroCusto })
                                  }
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                <Field
                                  label="Local de trabalho"
                                  value={row.asoLocal}
                                  onChange={(asoLocal) => updateRow(index, { asoLocal })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                <Field
                                  label="Empresa"
                                  value={row.asoEmpresa}
                                  onChange={(asoEmpresa) => updateRow(index, { asoEmpresa })}
                                  styles={styles}
                                  colors={colors}
                                  isDark={isDark}
                                />
                                <Text style={styles.fieldLabel}>Seguir PCMSO</Text>
                                <View style={styles.segRow}>
                                  {(['SIM', 'NAO'] as const).map((p) => (
                                    <TouchableOpacity
                                      key={p}
                                      style={[
                                        styles.segBtn,
                                        row.seguirPcmso === p && styles.segBtnActive,
                                      ]}
                                      onPress={() => updateRow(index, { seguirPcmso: p })}
                                    >
                                      <Text
                                        style={[
                                          styles.segText,
                                          row.seguirPcmso === p && styles.segTextActive,
                                        ]}
                                      >
                                        {p === 'SIM' ? 'Sim' : 'Não'}
                                      </Text>
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              </>
                            ) : null}
                          </View>
                        );
                      })
                    : null}

                  {requestType && rows.length < maxRows ? (
                    <TouchableOpacity
                      style={styles.addMoreBtn}
                      onPress={addRow}
                      activeOpacity={0.75}
                    >
                      <Plus size={16} color={colors.primary} strokeWidth={2.4} />
                      <Text style={styles.addMoreText}>Adicionar mais</Text>
                    </TouchableOpacity>
                  ) : null}

                </ScrollView>

                <View
                  style={[
                    styles.formFooter,
                    { borderTopColor: isDark ? colors.border : 'rgba(0,0,0,0.06)' },
                  ]}
                >
                  <TouchableOpacity
                    style={[styles.primaryBtn, styles.formSubmitBtn, saving && { opacity: 0.7 }]}
                    onPress={() => void submitCreate()}
                    disabled={saving}
                    activeOpacity={0.85}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Enviar solicitação</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Generic option picker */}
      <Modal
        visible={!!picker}
        animationType="slide"
        transparent
        onRequestClose={() => setPicker(null)}
      >
        <View style={styles.pickerOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setPicker(null)}
          />
          <View style={[styles.pickerSheet, { backgroundColor: colors.background }]}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{picker?.title}</Text>
              <TouchableOpacity
                onPress={() => setPicker(null)}
                style={[styles.formCloseBtn, { width: 36, height: 36 }]}
                accessibilityLabel="Fechar"
              >
                <X size={18} color={colors.text} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
            <View style={[styles.pickerSearchBox, { marginBottom: 10 }]}>
              <Search size={16} color={colors.textSecondary} />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Buscar..."
                placeholderTextColor={colors.textSecondary}
                value={pickerSearch}
                onChangeText={setPickerSearch}
              />
            </View>
            <FlatList
              data={pickerFiltered}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) =>
                'avatarUri' in item ? (
                  <PersonPickerListRow
                    label={item.label}
                    subtitle={item.subtitle}
                    avatarUri={item.avatarUri}
                    colors={colors}
                    isDark={isDark}
                    onPress={() => {
                      picker?.onSelect(item.value);
                      setPicker(null);
                    }}
                  />
                ) : (
                  <TouchableOpacity
                    style={[
                      styles.pickerItem,
                      { backgroundColor: isDark ? colors.card : colors.surface },
                    ]}
                    onPress={() => {
                      picker?.onSelect(item.value);
                      setPicker(null);
                    }}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.pickerItemLabel}>{item.label}</Text>
                    {item.subtitle ? (
                      <Text style={styles.pickerItemSub}>{item.subtitle}</Text>
                    ) : null}
                  </TouchableOpacity>
                )
              }
              ListEmptyComponent={
                <Text style={styles.pickerEmpty}>Nenhum resultado</Text>
              }
              contentContainerStyle={{ paddingBottom: 24, gap: 8 }}
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
  isDark,
  multiline,
  keyboardType,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  styles: ReturnType<typeof getStyles>;
  colors: any;
  isDark: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'number-pad' | 'email-address' | 'phone-pad';
  placeholder?: string;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder || label}
        placeholderTextColor={colors.textSecondary}
        style={[
          styles.input,
          {
            backgroundColor: isDark ? colors.card : colors.surface,
            borderWidth: StyleSheet.hairlineWidth * 1.5,
            borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
          },
          multiline && styles.inputMultiline,
        ]}
        multiline={multiline}
        keyboardType={keyboardType}
      />
    </View>
  );
}

function AttachButton({
  label,
  attached,
  onPress,
  styles,
  colors,
  isDark,
}: {
  label: string;
  attached: boolean;
  onPress: () => void;
  styles: ReturnType<typeof getStyles>;
  colors: any;
  isDark: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.attachBtn,
        {
          backgroundColor: isDark ? colors.card : colors.surface,
          borderWidth: StyleSheet.hairlineWidth * 1.5,
          borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View
        style={[
          styles.attachIcon,
          { backgroundColor: attached ? `${colors.success}18` : `${colors.primary}14` },
        ]}
      >
        <Paperclip size={16} color={attached ? colors.success : colors.primary} strokeWidth={2.2} />
      </View>
      <Text
        style={[styles.attachText, attached && { color: colors.success }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function getStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.screenRoot },
    container: { flex: 1, backgroundColor: colors.screenRoot },
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
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 15,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: 15,
      fontWeight: '500',
      letterSpacing: -0.2,
    },
    inputMultiline: {
      minHeight: 96,
      textAlignVertical: 'top',
      paddingTop: 14,
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
    formHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 16,
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
      fontSize: 14,
      fontWeight: '500',
      marginTop: 2,
    },
    formBackRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 8,
    },
    formBackText: {
      color: colors.primary,
      fontSize: 13,
      fontWeight: '600',
    },
    formCloseBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    formScroll: {
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 28,
    },
    formFooter: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    formSubmitBtn: {
      marginTop: 0,
      marginBottom: 0,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginTop: 10,
      marginBottom: 12,
      opacity: 0.55,
    },
    segRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 14,
    },
    segBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    segBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    segText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    segTextActive: { color: '#fff' },
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
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
      letterSpacing: -0.1,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
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
      backgroundColor: isDark ? colors.card : colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    targetIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    targetTitle: { fontSize: 15, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
    targetSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '500' },
    attachBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 14,
      padding: 14,
      marginBottom: 14,
    },
    attachIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    attachText: { flex: 1, color: colors.primary, fontWeight: '600', fontSize: 14 },
    itemCard: {
      backgroundColor: isDark ? colors.card : colors.surface,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    itemCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
      gap: 8,
    },
    itemCardTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.2,
    },
    addMoreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 14,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.18)',
      backgroundColor: isDark ? colors.card : colors.surface,
      paddingVertical: 14,
      marginBottom: 8,
    },
    addMoreText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    pickerOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    pickerSheet: {
      maxHeight: '78%',
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    pickerSearchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 40,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    pickerSearchInput: {
      flex: 1,
      paddingVertical: 0,
      color: colors.text,
      fontSize: 14,
    },
    pickerHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)',
      marginTop: 10,
      marginBottom: 6,
    },
    pickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      marginBottom: 4,
    },
    pickerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.4,
      flex: 1,
    },
    pickerItem: {
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 14,
    },
    pickerItemLabel: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    pickerItemSub: {
      color: colors.textSecondary,
      fontSize: 12,
      marginTop: 3,
      fontWeight: '500',
    },
    pickerEmpty: {
      textAlign: 'center',
      color: colors.textSecondary,
      padding: 28,
      fontWeight: '500',
    },
  });
}
