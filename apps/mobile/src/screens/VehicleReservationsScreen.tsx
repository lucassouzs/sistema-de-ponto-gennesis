import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  FlatList,
  Image,
  ActivityIndicator,
  RefreshControl,
  Platform,
  PanResponder,
  LayoutChangeEvent,
  KeyboardAvoidingView,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import {
  Car,
  Search,
  Camera,
  X,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  ClipboardCheck,
  Trash2,
  FileText,
  Filter,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { onFabBarPress } from '../navigation/fabBarEvents';
import AppHeader from '../components/AppHeader';
import DateField from '../components/DateField';
type VehicleReservationStatus =
  | 'PENDING_SUPPLIES'
  | 'APPROVED'
  | 'COMPLETED'
  | 'INSPECTED'
  | 'REJECTED'
  | 'CANCELLED';

type CardFilter = 'all' | 'pending' | 'concluded' | 'cancelled';

type VehicleReservation = {
  id: string;
  code: string;
  solicitante: string;
  motorista: string;
  atividade: string;
  localDestino: string;
  dataUsoInicio: string;
  dataUsoFim: string;
  polo?: string | null;
  contrato?: string | null;
  observacaoCapacidadeVeiculo?: string | null;
  status: VehicleReservationStatus;
  createdById?: string;
  createdBy?: { id: string; name: string } | null;
  suppliesApprovalComment?: string | null;
  suppliesRejectionReason?: string | null;
  vehicle?: {
    id: string;
    placaVeic: string;
    marcaVeic?: string | null;
    modeloVeic?: string | null;
  } | null;
  devolucaoAt?: string | null;
  baixaObservacao?: string | null;
  baixaFotoUrl?: string | null;
  baixaReportedBy?: { id: string; name: string } | null;
  vistoriaAt?: string | null;
  vistoriaLaudoUrl?: string | null;
  vistoriaLaudoFileName?: string | null;
  vistoriaReportedBy?: { id: string; name: string } | null;
};

type EmployeeOption = { id: string; name: string; cpf: string };
type CostCenterOption = { label: string };

type FormState = {
  motorista: string;
  atividade: string;
  localDestino: string;
  dataUsoInicio: string;
  dataUsoFim: string;
  polo: string;
  contrato: string;
  observacaoCapacidadeVeiculo: string;
};

const STATUS_LABELS: Record<VehicleReservationStatus, string> = {
  PENDING_SUPPLIES: 'Aguardando',
  APPROVED: 'Em uso',
  COMPLETED: 'Aguardando vistoria',
  INSPECTED: 'Vistoriada',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

const POLO_OPTIONS = [
  { value: 'DF', label: 'DF' },
  { value: 'GO', label: 'GO' },
];

function defaultUsoDatetimeLocal(hour = 8, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function nowDatetimeLocal() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function EMPTY_FORM(): FormState {
  return {
    motorista: '',
    atividade: '',
    localDestino: '',
    dataUsoInicio: defaultUsoDatetimeLocal(8, 0),
    dataUsoFim: defaultUsoDatetimeLocal(17, 0),
    polo: '',
    contrato: '',
    observacaoCapacidadeVeiculo: '',
  };
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatVehicleLabel(
  vehicle?: {
    placaVeic?: string | null;
    marcaVeic?: string | null;
    modeloVeic?: string | null;
  } | null,
  emptyLabel = 'Veículo a definir'
) {
  if (!vehicle?.placaVeic && !vehicle?.modeloVeic && !vehicle?.marcaVeic) {
    return emptyLabel;
  }
  const model = [vehicle?.marcaVeic, vehicle?.modeloVeic].filter(Boolean).join(' ');
  return [vehicle?.placaVeic, model].filter(Boolean).join(' · ') || emptyLabel;
}

function statusColor(status: VehicleReservationStatus) {
  if (status === 'INSPECTED') return '#16a34a';
  if (status === 'APPROVED') return '#059669';
  if (status === 'COMPLETED') return '#d97706';
  if (status === 'REJECTED' || status === 'CANCELLED') return '#dc2626';
  return '#2563eb';
}

function isPending(status: VehicleReservationStatus) {
  return status === 'PENDING_SUPPLIES' || status === 'COMPLETED';
}

function isCancelled(status: VehicleReservationStatus) {
  return status === 'CANCELLED' || status === 'REJECTED';
}

type PickerOption = { value: string; label: string; subtitle?: string };

function formatCpfLabel(value?: string | null): string {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  return String(value || '').trim();
}

function SelectField({
  label,
  valueLabel,
  valueSubtitle,
  placeholder,
  onPress,
  colors,
  isDark,
}: {
  label: string;
  valueLabel: string;
  valueSubtitle?: string;
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
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: filled ? '600' : '500',
              color: filled ? colors.text : colors.textSecondary,
              letterSpacing: -0.2,
            }}
            numberOfLines={1}
          >
            {valueLabel || placeholder}
          </Text>
          {filled && valueSubtitle ? (
            <Text
              style={{
                marginTop: 3,
                fontSize: 12,
                fontWeight: '500',
                color: colors.textSecondary,
              }}
              numberOfLines={1}
            >
              {valueSubtitle}
            </Text>
          ) : null}
        </View>
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

function SignaturePad({
  colors,
  onChange,
}: {
  colors: any;
  onChange: (dataUrl: string) => void;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const pathsRef = useRef<string[]>([]);
  const currentPath = useRef('');
  const sizeRef = useRef({ w: 1, h: 1 });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const exportSvg = useCallback((allPaths: string[]) => {
    if (!allPaths.length) {
      onChangeRef.current('');
      return;
    }
    const { w, h } = sizeRef.current;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="white"/>${allPaths
      .map(
        (d) =>
          `<path d="${d}" stroke="#111" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
      .join('')}</svg>`;
    const encoded =
      typeof btoa === 'function'
        ? btoa(unescape(encodeURIComponent(svg)))
        : Buffer.from(svg, 'utf-8').toString('base64');
    onChangeRef.current(`data:image/svg+xml;base64,${encoded}`);
  }, []);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        currentPath.current = `M ${locationX} ${locationY}`;
        setPaths((p) => {
          const next = [...p, currentPath.current];
          pathsRef.current = next;
          return next;
        });
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        currentPath.current += ` L ${locationX} ${locationY}`;
        setPaths((p) => {
          const next = [...p];
          next[next.length - 1] = currentPath.current;
          pathsRef.current = next;
          return next;
        });
      },
      onPanResponderRelease: () => {
        // Fora do setState — evita "Cannot update a component while rendering"
        exportSvg(pathsRef.current);
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    sizeRef.current = { w: width, h: height };
  };

  const clear = () => {
    pathsRef.current = [];
    setPaths([]);
    onChangeRef.current('');
  };

  return (
    <View>
      <View
        onLayout={onLayout}
        style={{
          height: 160,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: '#fff',
          overflow: 'hidden',
        }}
        {...pan.panHandlers}
      >
        <Svg width="100%" height="100%">
          {paths.map((d, i) => (
            <Path
              key={`${i}-${d.slice(0, 12)}`}
              d={d}
              stroke="#111"
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
      </View>
      <TouchableOpacity onPress={clear} style={{ marginTop: 8, alignSelf: 'flex-end' }}>
        <Text style={{ color: colors.primary, fontWeight: '600' }}>Limpar assinatura</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function VehicleReservationsScreen() {
  const navigation = useNavigation();
  const navState = navigation.getState?.();
  const isTabScreen = navState?.type === 'tab';
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors, isDark);

  const [rows, setRows] = useState<VehicleReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | VehicleReservationStatus>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM());
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [contracts, setContracts] = useState<CostCenterOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [returnTarget, setReturnTarget] = useState<VehicleReservation | null>(null);
  const [detailTarget, setDetailTarget] = useState<VehicleReservation | null>(null);
  const [returnForm, setReturnForm] = useState({
    devolucaoAt: nowDatetimeLocal(),
    baixaFoto: '',
    baixaObservacao: '',
    baixaAssinatura: '',
  });
  const [returning, setReturning] = useState(false);

  const [picker, setPicker] = useState<{
    title: string;
    options: PickerOption[];
    onSelect: (value: string) => void;
  } | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  const loadList = useCallback(async () => {
    try {
      const res = await api.get('/api/vehicle-reservations?limit=100&page=1');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || 'Erro ao carregar');
      const all = (data?.data || []) as VehicleReservation[];
      const mine = all.filter(
        (r) =>
          r.createdBy?.id === user?.id ||
          r.createdById === user?.id ||
          r.solicitante === user?.name,
      );
      setRows(mine);
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Erro',
        text2: e?.message || 'Não foi possível carregar reservas',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, user?.name]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadFormOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const [driversRes, ccRes] = await Promise.all([
        api.get('/api/fuel-refuel-requests/driver-options'),
        api.get('/api/cost-centers?isActive=true&limit=2000'),
      ]);
      const driversJson = await driversRes.json();
      const ccJson = await ccRes.json();

      if (driversRes.ok) {
        const list = (driversJson?.data || []) as Array<{
          id: string;
          name: string;
          cpf?: string;
        }>;
        const opts = list
          .map((d) => ({
            id: String(d.id),
            name: String(d.name || '').trim(),
            cpf: formatCpfLabel(d.cpf),
          }))
          .filter((e: EmployeeOption) => e.name)
          .sort((a: EmployeeOption, b: EmployeeOption) =>
            a.name.localeCompare(b.name, 'pt-BR'),
          );
        setEmployees(opts);
      }

      if (ccRes.ok) {
        const list = Array.isArray(ccJson?.data) ? ccJson.data : ccJson?.data?.data || [];
        const seen = new Set<string>();
        const mapped: CostCenterOption[] = [];
        for (const cc of list) {
          const label = String(cc.name || cc.code || '').trim();
          if (!label || seen.has(label)) continue;
          seen.add(label);
          mapped.push({ label });
        }
        setContracts(mapped);
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Erro ao carregar opções' });
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  const openForm = () => {
    setForm(EMPTY_FORM());
    setShowForm(true);
    void loadFormOptions();
  };

  useEffect(() => {
    const sub = onFabBarPress('Reservas', openForm);
    return () => sub.remove();
  }, [loadFormOptions]);

  const counts = useMemo(() => {
    const pending = rows.filter((r) => isPending(r.status)).length;
    const concluded = rows.filter((r) => r.status === 'INSPECTED').length;
    const cancelled = rows.filter((r) => isCancelled(r.status)).length;
    return { total: rows.length, pending, concluded, cancelled };
  }, [rows]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (cardFilter === 'pending') list = list.filter((r) => isPending(r.status));
    if (cardFilter === 'concluded') list = list.filter((r) => r.status === 'INSPECTED');
    if (cardFilter === 'cancelled') list = list.filter((r) => isCancelled(r.status));
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter);
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [
          r.code,
          r.solicitante,
          r.motorista,
          r.atividade,
          r.localDestino,
          r.vehicle?.placaVeic || '',
          r.vehicle?.marcaVeic || '',
          r.vehicle?.modeloVeic || '',
          STATUS_LABELS[r.status],
        ]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [rows, cardFilter, searchTerm, statusFilter]);

  const submitForm = async () => {
    const solicitante = String(user?.name || '').trim();
    if (!solicitante) {
      Toast.show({ type: 'error', text1: 'Não foi possível identificar o solicitante logado' });
      return;
    }
    if (!form.motorista) {
      Toast.show({ type: 'error', text1: 'Selecione o motorista' });
      return;
    }
    if (!form.atividade.trim()) {
      Toast.show({ type: 'error', text1: 'Informe a atividade' });
      return;
    }
    if (!form.localDestino.trim()) {
      Toast.show({ type: 'error', text1: 'Informe o local de destino' });
      return;
    }
    if (!form.dataUsoInicio || !form.dataUsoFim) {
      Toast.show({ type: 'error', text1: 'Informe início e fim do uso' });
      return;
    }
    if (form.dataUsoFim < form.dataUsoInicio) {
      Toast.show({ type: 'error', text1: 'Fim do uso inválido' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/api/vehicle-reservations', {
        solicitante,
        motorista: form.motorista,
        atividade: form.atividade.trim(),
        localDestino: form.localDestino.trim(),
        dataUsoInicio: form.dataUsoInicio,
        dataUsoFim: form.dataUsoFim,
        periodoUso: [],
        polo: form.polo || undefined,
        contrato: form.contrato || undefined,
        observacaoCapacidadeVeiculo: form.observacaoCapacidadeVeiculo.trim() || undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || 'Erro ao registrar');
      Toast.show({ type: 'success', text1: data?.message || 'Reserva registrada' });
      setShowForm(false);
      setLoading(true);
      void loadList();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Erro', text2: e?.message || 'Falha ao registrar' });
    } finally {
      setSubmitting(false);
    }
  };

  const takeReturnPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Permissão de câmera necessária' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setReturnForm((f) => ({
        ...f,
        baixaFoto: `data:image/jpeg;base64,${result.assets[0].base64}`,
      }));
    }
  };

  const submitReturn = async () => {
    if (!returnTarget) return;
    if (!returnForm.devolucaoAt) {
      Toast.show({ type: 'error', text1: 'Informe data/hora da devolução' });
      return;
    }
    if (!returnForm.baixaFoto.startsWith('data:image/')) {
      Toast.show({ type: 'error', text1: 'Tire a foto do veículo' });
      return;
    }
    if (!returnForm.baixaAssinatura.startsWith('data:image/')) {
      Toast.show({ type: 'error', text1: 'Assine a devolução' });
      return;
    }

    setReturning(true);
    try {
      const devolucaoAt = new Date(returnForm.devolucaoAt).toISOString();
      const res = await api.put(`/api/vehicle-reservations/${returnTarget.id}/submit-return`, {
        devolucaoAt,
        baixaFoto: returnForm.baixaFoto,
        baixaAssinatura: returnForm.baixaAssinatura,
        baixaObservacao: returnForm.baixaObservacao.trim() || undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || 'Erro na baixa');
      Toast.show({ type: 'success', text1: data?.message || 'Baixa registrada' });
      setReturnTarget(null);
      setLoading(true);
      void loadList();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Erro', text2: e?.message || 'Falha na baixa' });
    } finally {
      setReturning(false);
    }
  };

  const pickerFiltered = useMemo(() => {
    if (!picker) return [];
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return picker.options;
    return picker.options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.subtitle || '').toLowerCase().includes(q),
    );
  }, [picker, pickerSearch]);

  const chips: { key: CardFilter; label: string; count: number; Icon: any }[] = [
    { key: 'all', label: 'Todas', count: counts.total, Icon: Car },
    { key: 'pending', label: 'Pendentes', count: counts.pending, Icon: Clock },
    { key: 'concluded', label: 'Vistoriadas', count: counts.concluded, Icon: CheckCircle },
    { key: 'cancelled', label: 'Canceladas', count: counts.cancelled, Icon: XCircle },
  ];

  const canReturn = (r: VehicleReservation) =>
    r.status === 'APPROVED' &&
    (user?.role === 'ADMIN' ||
      r.createdBy?.id === user?.id ||
      r.solicitante === user?.name);

  const canDelete = (r: VehicleReservation) => r.status === 'PENDING_SUPPLIES';

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteReservation = (row: VehicleReservation) => {
    if (!canDelete(row)) {
      Toast.show({
        type: 'error',
        text1: 'Somente reservas pendentes podem ser excluídas',
      });
      return;
    }

    Alert.alert(
      'Excluir reserva',
      `Tem certeza que deseja excluir a reserva #${row.code}? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(row.id);
            try {
              const res = await api.delete(`/api/vehicle-reservations/${row.id}`);
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                throw new Error(data?.message || data?.error || 'Erro ao excluir');
              }
              if (detailTarget?.id === row.id) setDetailTarget(null);
              Toast.show({ type: 'success', text1: 'Reserva excluída' });
              await loadList();
            } catch (e: any) {
              Toast.show({
                type: 'error',
                text1: 'Erro',
                text2: e?.message || 'Não foi possível excluir',
              });
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader />

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
      >
        <Text style={styles.pageTitle}>Reservas</Text>
        <Text style={styles.pageSubtitle}>
          Reserve veículos e acompanhe o status
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {chips.map(({ key, label, count }) => {
            const active = cardFilter === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setCardFilter(key)}
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
              placeholder="Buscar motorista, placa, status..."
              placeholderTextColor={colors.textSecondary}
              value={searchTerm}
              onChangeText={setSearchTerm}
              returnKeyType="search"
            />
            {searchTerm.length > 0 ? (
              <TouchableOpacity onPress={() => setSearchTerm('')} hitSlop={8}>
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
            {statusFilter !== 'all'
              ? STATUS_LABELS[statusFilter]
              : cardFilter === 'all'
                ? 'Reservas'
                : chips.find((c) => c.key === cardFilter)?.label || 'Reservas'}
          </Text>
          <Text style={styles.listHeadingMeta}>{filteredRows.length}</Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
        ) : filteredRows.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Car size={28} color={colors.textSecondary} />
            </View>
            <Text style={styles.emptyTitle}>Nenhuma reserva</Text>
            <Text style={styles.emptyText}>Toque no + para solicitar um veículo.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredRows.map((row) => (
              <View key={row.id} style={styles.card}>
                <TouchableOpacity onPress={() => setDetailTarget(row)} activeOpacity={0.85}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardNumber}>#{row.code}</Text>
                    <View style={[styles.badge, { backgroundColor: `${statusColor(row.status)}18` }]}>
                      <Text style={[styles.badgeText, { color: statusColor(row.status) }]}>
                        {STATUS_LABELS[row.status]}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardRoute} numberOfLines={2}>
                    {row.atividade}
                  </Text>
                  <View style={styles.cardFooter}>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {formatDateLabel(row.dataUsoInicio)} → {formatDateLabel(row.dataUsoFim)}
                    </Text>
                  </View>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {row.motorista} · {row.localDestino}
                  </Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {formatVehicleLabel(row.vehicle)}
                  </Text>
                  <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
                    Toque para ver detalhes
                  </Text>
                </TouchableOpacity>
                {canReturn(row) ? (
                  <TouchableOpacity
                    style={styles.returnBtn}
                    onPress={() => {
                      setReturnForm({
                        devolucaoAt: nowDatetimeLocal(),
                        baixaFoto: '',
                        baixaObservacao: '',
                        baixaAssinatura: '',
                      });
                      setReturnTarget(row);
                    }}
                    activeOpacity={0.8}
                  >
                    <ClipboardCheck size={15} color={colors.primary} strokeWidth={2.2} />
                    <Text style={styles.returnBtnText}>Dar baixa</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Filtro de status */}
      <Modal
        visible={filterOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterOpen(false)}
      >
        <View style={styles.filterOverlay}>
          <View style={[styles.filterSheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.filterSheetTitle, { color: colors.text }]}>
              Filtro de status
            </Text>
            <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={styles.filterOptionRow}
                onPress={() => {
                  setStatusFilter('all');
                  setFilterOpen(false);
                }}
              >
                <Text style={[styles.filterOptionText, { color: colors.text }]}>Todos</Text>
                {statusFilter === 'all' ? (
                  <CheckCircle size={16} color={colors.primary} strokeWidth={2.4} />
                ) : null}
              </TouchableOpacity>
              {(Object.keys(STATUS_LABELS) as VehicleReservationStatus[]).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={styles.filterOptionRow}
                  onPress={() => {
                    setStatusFilter(s);
                    setFilterOpen(false);
                  }}
                >
                  <Text style={[styles.filterOptionText, { color: colors.text }]}>
                    {STATUS_LABELS[s]}
                  </Text>
                  {statusFilter === s ? (
                    <CheckCircle size={16} color={colors.primary} strokeWidth={2.4} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() => setFilterOpen(false)}
              style={{ marginTop: 8, paddingVertical: 8 }}
            >
              <Text style={{ textAlign: 'center', color: colors.textSecondary, fontWeight: '600' }}>
                Fechar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Detalhes da reserva */}
      <Modal
        visible={Boolean(detailTarget)}
        animationType="fade"
        transparent
        onRequestClose={() => setDetailTarget(null)}
      >
        <View style={styles.detailOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setDetailTarget(null)}
          />
          <View style={[styles.detailSheet, { backgroundColor: colors.card }]}>
            <View style={styles.detailSheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.detailSheetTitle, { color: colors.text }]}>
                  Reserva #{detailTarget?.code ?? ''}
                </Text>
                <Text style={[styles.detailSheetSubtitle, { color: colors.textSecondary }]}>
                  {detailTarget ? STATUS_LABELS[detailTarget.status] : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setDetailTarget(null)}
                style={styles.formCloseBtn}
                hitSlop={6}
                accessibilityLabel="Fechar"
              >
                <X size={18} color={colors.text} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            {detailTarget ? (
              <ScrollView
                style={{ maxHeight: 420 }}
                showsVerticalScrollIndicator={false}
                bounces={false}
              >
                <View style={styles.detailGrid}>
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Status</Text>
                    <Text style={[styles.detailValue, { color: statusColor(detailTarget.status) }]}>
                      {STATUS_LABELS[detailTarget.status]}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      Atividade
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {detailTarget.atividade}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      Destino
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {detailTarget.localDestino}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      Solicitante
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {detailTarget.solicitante}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      Motorista
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {detailTarget.motorista}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      Início do uso
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {formatDateLabel(detailTarget.dataUsoInicio)}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      Fim do uso
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text }]}>
                      {formatDateLabel(detailTarget.dataUsoFim)}
                    </Text>
                  </View>
                  {detailTarget.contrato ? (
                    <View style={styles.detailField}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                        Contrato
                      </Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>
                        {detailTarget.contrato}
                      </Text>
                    </View>
                  ) : null}
                  {detailTarget.polo ? (
                    <View style={styles.detailField}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Polo</Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>
                        {detailTarget.polo}
                      </Text>
                    </View>
                  ) : null}
                  {detailTarget.observacaoCapacidadeVeiculo ? (
                    <View style={styles.detailField}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                        Observações
                      </Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>
                        {detailTarget.observacaoCapacidadeVeiculo}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {detailTarget.vehicle ? (
                  <View
                    style={[
                      styles.releaseBlock,
                      {
                        backgroundColor: isDark
                          ? 'rgba(5, 150, 105, 0.12)'
                          : 'rgba(5, 150, 105, 0.08)',
                      },
                    ]}
                  >
                    <View style={styles.releaseRow}>
                      <Car size={16} color="#059669" strokeWidth={2.2} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.releaseLabel}>Veículo liberado</Text>
                        <Text style={[styles.detailValue, { color: colors.text }]}>
                          {formatVehicleLabel(detailTarget.vehicle, '—')}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}

                {detailTarget.suppliesApprovalComment ? (
                  <View
                    style={[
                      styles.releaseBlock,
                      { backgroundColor: colors.background },
                    ]}
                  >
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      Observação do Suprimentos
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text, marginTop: 4 }]}>
                      {detailTarget.suppliesApprovalComment}
                    </Text>
                  </View>
                ) : null}

                {detailTarget.suppliesRejectionReason ? (
                  <View
                    style={[
                      styles.releaseBlock,
                      {
                        backgroundColor: isDark
                          ? 'rgba(206,55,54,0.12)'
                          : 'rgba(206,55,54,0.08)',
                      },
                    ]}
                  >
                    <Text style={[styles.detailLabel, { color: colors.error || '#dc2626' }]}>
                      Motivo da rejeição
                    </Text>
                    <Text style={[styles.detailValue, { color: colors.text, marginTop: 4 }]}>
                      {detailTarget.suppliesRejectionReason}
                    </Text>
                  </View>
                ) : null}

                {detailTarget.status === 'COMPLETED' || detailTarget.status === 'INSPECTED' ? (
                  <View
                    style={[
                      styles.releaseBlock,
                      { backgroundColor: colors.background },
                    ]}
                  >
                    <Text style={styles.releaseLabel}>Baixa do veículo</Text>
                    <View style={[styles.detailField, { marginBottom: 0, marginTop: 10 }]}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                        Data/hora da devolução
                      </Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>
                        {detailTarget.devolucaoAt
                          ? formatDateLabel(detailTarget.devolucaoAt)
                          : '—'}
                      </Text>
                    </View>
                    <View style={[styles.detailField, { marginBottom: 0, marginTop: 10 }]}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                        Registrado por
                      </Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>
                        {detailTarget.baixaReportedBy?.name || '—'}
                      </Text>
                    </View>
                    {detailTarget.baixaObservacao ? (
                      <View style={[styles.detailField, { marginBottom: 0, marginTop: 10 }]}>
                        <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                          Observação
                        </Text>
                        <Text style={[styles.detailValue, { color: colors.text }]}>
                          {detailTarget.baixaObservacao}
                        </Text>
                      </View>
                    ) : null}
                    {detailTarget.baixaFotoUrl ? (
                      <Image
                        source={{ uri: detailTarget.baixaFotoUrl }}
                        style={[styles.photoPreview, { marginTop: 12, marginBottom: 0 }]}
                      />
                    ) : null}
                  </View>
                ) : null}

                {detailTarget.status === 'INSPECTED' ? (
                  <View
                    style={[
                      styles.releaseBlock,
                      {
                        backgroundColor: isDark
                          ? 'rgba(217, 119, 6, 0.12)'
                          : 'rgba(217, 119, 6, 0.08)',
                      },
                    ]}
                  >
                    <Text style={[styles.releaseLabel, { color: '#d97706' }]}>
                      Vistoria do veículo
                    </Text>
                    <View style={[styles.detailField, { marginBottom: 0, marginTop: 10 }]}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                        Data e hora da vistoria
                      </Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>
                        {detailTarget.vistoriaAt
                          ? formatDateLabel(detailTarget.vistoriaAt)
                          : '—'}
                      </Text>
                    </View>
                    <View style={[styles.detailField, { marginBottom: 0, marginTop: 10 }]}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                        Registrado por
                      </Text>
                      <Text style={[styles.detailValue, { color: colors.text }]}>
                        {detailTarget.vistoriaReportedBy?.name || '—'}
                      </Text>
                    </View>
                    {detailTarget.vistoriaLaudoUrl ? (
                      <TouchableOpacity
                        style={[styles.secondaryBtn, { marginTop: 12, marginBottom: 0 }]}
                        onPress={() => {
                          void Linking.openURL(detailTarget.vistoriaLaudoUrl!);
                        }}
                        activeOpacity={0.75}
                      >
                        <FileText size={16} color={colors.primary} strokeWidth={2.2} />
                        <Text style={styles.secondaryBtnText}>
                          {detailTarget.vistoriaLaudoFileName || 'Abrir laudo de vistoria'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </ScrollView>
            ) : null}

            {detailTarget && canDelete(detailTarget) ? (
              <TouchableOpacity
                style={[styles.deleteBtn, styles.returnBtnInModal]}
                onPress={() => deleteReservation(detailTarget)}
                activeOpacity={0.85}
                disabled={deletingId === detailTarget.id}
              >
                {deletingId === detailTarget.id ? (
                  <ActivityIndicator color="#dc2626" />
                ) : (
                  <>
                    <Trash2 size={15} color="#dc2626" strokeWidth={2.2} />
                    <Text style={styles.deleteBtnText}>Excluir reserva</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}

            {detailTarget && canReturn(detailTarget) ? (
              <TouchableOpacity
                style={[styles.returnBtn, styles.returnBtnInModal]}
                onPress={() => {
                  const row = detailTarget;
                  setDetailTarget(null);
                  setReturnForm({
                    devolucaoAt: nowDatetimeLocal(),
                    baixaFoto: '',
                    baixaObservacao: '',
                    baixaAssinatura: '',
                  });
                  setReturnTarget(row);
                }}
                activeOpacity={0.85}
              >
                <ClipboardCheck size={15} color={colors.primary} strokeWidth={2.2} />
                <Text style={styles.returnBtnText}>Dar baixa</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Form criar */}
      <Modal
        visible={showForm}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowForm(false)}
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
                <Text style={styles.formTitle}>Nova reserva</Text>
                <Text style={styles.formSubtitle}>Agende o uso do veículo</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowForm(false)}
                style={styles.formCloseBtn}
                hitSlop={6}
                accessibilityLabel="Fechar"
              >
                <X size={20} color={colors.text} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            {loadingOptions ? (
              <View style={styles.formLoading}>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.formLoadingText}>Carregando opções…</Text>
              </View>
            ) : (
              <>
                <ScrollView
                  contentContainerStyle={styles.formScroll}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={styles.sectionTitle}>Pessoas</Text>
                  <SelectField
                    label="Motorista"
                    valueLabel={form.motorista}
                    valueSubtitle={
                      employees.find((e) => e.name === form.motorista)?.cpf || undefined
                    }
                    placeholder="Selecione"
                    colors={colors}
                    isDark={isDark}
                    onPress={() => {
                      setPickerSearch('');
                      setPicker({
                        title: 'Motorista',
                        options: employees.map((e) => ({
                          value: e.name,
                          label: e.name,
                          subtitle: e.cpf || undefined,
                        })),
                        onSelect: (motorista) => setForm((f) => ({ ...f, motorista })),
                      });
                    }}
                  />

                  <Text style={styles.sectionTitle}>Atividade</Text>
                  <Text style={styles.fieldLabel}>Atividade</Text>
                  <TextInput
                    style={styles.input}
                    value={form.atividade}
                    onChangeText={(atividade) => setForm((f) => ({ ...f, atividade }))}
                    placeholder="Descreva a atividade"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.fieldLabel}>Local de destino</Text>
                  <TextInput
                    style={styles.input}
                    value={form.localDestino}
                    onChangeText={(localDestino) => setForm((f) => ({ ...f, localDestino }))}
                    placeholder="Destino"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.sectionTitle}>Agenda</Text>
                  <DateField
                    label="Início do uso"
                    value={form.dataUsoInicio}
                    mode="datetime"
                    onChange={(dataUsoInicio) =>
                      setForm((f) => ({
                        ...f,
                        dataUsoInicio,
                        dataUsoFim: f.dataUsoFim < dataUsoInicio ? dataUsoInicio : f.dataUsoFim,
                      }))
                    }
                    placeholder="Selecionar data e hora"
                  />
                  <DateField
                    label="Fim do uso"
                    value={form.dataUsoFim}
                    mode="datetime"
                    onChange={(dataUsoFim) =>
                      setForm((f) => ({
                        ...f,
                        dataUsoFim:
                          f.dataUsoInicio && dataUsoFim < f.dataUsoInicio
                            ? f.dataUsoInicio
                            : dataUsoFim,
                      }))
                    }
                    placeholder="Selecionar data e hora"
                    minimumDate={
                      form.dataUsoInicio
                        ? new Date(
                            +form.dataUsoInicio.slice(0, 4),
                            +form.dataUsoInicio.slice(5, 7) - 1,
                            +form.dataUsoInicio.slice(8, 10),
                            +(form.dataUsoInicio.slice(11, 13) || '0'),
                            +(form.dataUsoInicio.slice(14, 16) || '0'),
                          )
                        : undefined
                    }
                  />

                  <Text style={styles.sectionTitle}>Extras</Text>
                  <SelectField
                    label="Polo (opcional)"
                    valueLabel={form.polo}
                    placeholder="Selecione"
                    colors={colors}
                    isDark={isDark}
                    onPress={() => {
                      setPickerSearch('');
                      setPicker({
                        title: 'Polo',
                        options: POLO_OPTIONS,
                        onSelect: (polo) => setForm((f) => ({ ...f, polo })),
                      });
                    }}
                  />

                  <SelectField
                    label="Contrato (opcional)"
                    valueLabel={form.contrato}
                    placeholder="Selecione"
                    colors={colors}
                    isDark={isDark}
                    onPress={() => {
                      setPickerSearch('');
                      setPicker({
                        title: 'Contrato',
                        options: contracts.map((c) => ({ value: c.label, label: c.label })),
                        onSelect: (contrato) => setForm((f) => ({ ...f, contrato })),
                      });
                    }}
                  />

                  <Text style={styles.fieldLabel}>Observações (opcional)</Text>
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={form.observacaoCapacidadeVeiculo}
                    onChangeText={(observacaoCapacidadeVeiculo) =>
                      setForm((f) => ({ ...f, observacaoCapacidadeVeiculo }))
                    }
                    placeholder="Ex.: precisa de 5 lugares"
                    placeholderTextColor={colors.textSecondary}
                    multiline
                  />
                </ScrollView>

                <View style={[styles.formFooter, { borderTopColor: isDark ? colors.border : 'rgba(0,0,0,0.06)' }]}>
                  <TouchableOpacity
                    style={[styles.primaryBtn, styles.formSubmitBtn, submitting && { opacity: 0.7 }]}
                    onPress={submitForm}
                    disabled={submitting}
                    activeOpacity={0.85}
                  >
                    {submitting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>Enviar reserva</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Modal baixa */}
      <Modal
        visible={!!returnTarget}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setReturnTarget(null)}
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
                <Text style={styles.formTitle}>Dar baixa</Text>
                <Text style={styles.formSubtitle}>
                  Reserva #{returnTarget?.code} ·{' '}
                  {formatVehicleLabel(returnTarget?.vehicle, 'Veículo')}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReturnTarget(null)}
                style={styles.formCloseBtn}
                hitSlop={6}
              >
                <X size={20} color={colors.text} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={styles.formScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <DateField
                label="Data/hora devolução"
                value={returnForm.devolucaoAt}
                onChange={(devolucaoAt) => setReturnForm((f) => ({ ...f, devolucaoAt }))}
                mode="datetime"
                placeholder="Selecionar data e hora"
              />

              <Text style={styles.fieldLabel}>Foto do veículo</Text>
              {returnForm.baixaFoto ? (
                <Image source={{ uri: returnForm.baixaFoto }} style={styles.photoPreview} />
              ) : null}
              <TouchableOpacity style={styles.secondaryBtn} onPress={takeReturnPhoto} activeOpacity={0.75}>
                <Camera size={16} color={colors.primary} strokeWidth={2.2} />
                <Text style={styles.secondaryBtnText}>Tirar foto</Text>
              </TouchableOpacity>

              <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Assinatura</Text>
              <SignaturePad
                colors={colors}
                onChange={(baixaAssinatura) => setReturnForm((f) => ({ ...f, baixaAssinatura }))}
              />

              <Text style={styles.fieldLabel}>Observação (opcional)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={returnForm.baixaObservacao}
                onChangeText={(baixaObservacao) =>
                  setReturnForm((f) => ({ ...f, baixaObservacao }))
                }
                placeholder="Ex.: veículo sem avarias"
                placeholderTextColor={colors.textSecondary}
                multiline
              />
            </ScrollView>
            <View style={[styles.formFooter, { borderTopColor: isDark ? colors.border : 'rgba(0,0,0,0.06)' }]}>
              <TouchableOpacity
                style={[styles.primaryBtn, styles.formSubmitBtn, returning && { opacity: 0.7 }]}
                onPress={submitReturn}
                disabled={returning}
                activeOpacity={0.85}
              >
                {returning ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Confirmar baixa</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Picker */}
      <Modal visible={!!picker} animationType="slide" transparent onRequestClose={() => setPicker(null)}>
        <View style={styles.pickerOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setPicker(null)} />
          <View style={[styles.pickerSheet, { backgroundColor: colors.background }]}>
            <View style={styles.pickerHandle} />
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>{picker?.title}</Text>
              <TouchableOpacity
                onPress={() => setPicker(null)}
                style={[styles.formCloseBtn, { width: 36, height: 36 }]}
              >
                <X size={18} color={colors.text} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>
            <View style={[styles.searchBox, { marginBottom: 12 }]}>
              <Search size={18} color={colors.textSecondary} />
              <TextInput
                style={styles.searchInput}
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
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.pickerItem, { backgroundColor: isDark ? colors.card : colors.surface }]}
                  onPress={() => {
                    picker?.onSelect(item.value);
                    setPicker(null);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', letterSpacing: -0.2 }}>
                    {item.label}
                  </Text>
                  {item.subtitle ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 3, fontWeight: '500' }}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ textAlign: 'center', color: colors.textSecondary, padding: 28, fontWeight: '500' }}>
                  Nenhum resultado
                </Text>
              }
              contentContainerStyle={{ paddingBottom: 24, gap: 8 }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, backgroundColor: colors.background },
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
    iconBtn: { padding: 8, width: 40, alignItems: 'center' },
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
      fontSize: 14,
      fontWeight: '500',
      marginTop: 2,
    },
    formLoading: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    formLoadingText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
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
    headerTitle: { color: colors.headerText, fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
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
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
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
    filterOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    filterSheet: {
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      padding: 18,
      paddingBottom: 28,
    },
    filterSheetTitle: {
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 12,
    },
    filterOptionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
    },
    filterOptionText: { fontSize: 15, fontWeight: '500', flex: 1, paddingRight: 12 },
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
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginTop: 8,
      marginBottom: 8,
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
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
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
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
    returnBtn: {
      marginTop: 14,
      backgroundColor: isDark ? 'rgba(206,55,54,0.15)' : 'rgba(206,55,54,0.08)',
      borderRadius: 12,
      paddingVertical: 11,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    returnBtnInModal: {
      marginTop: 8,
      minHeight: 48,
    },
    returnBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
    deleteBtn: {
      marginTop: 14,
      backgroundColor: isDark ? 'rgba(220,38,38,0.15)' : 'rgba(220,38,38,0.08)',
      borderRadius: 12,
      paddingVertical: 11,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    deleteBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 14 },
    detailOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
      padding: 16,
      paddingBottom: 28,
    },
    detailSheet: {
      borderRadius: 20,
      padding: 18,
      gap: 12,
      maxHeight: '88%',
    },
    detailSheetHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 4,
    },
    detailSheetTitle: {
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    detailSheetSubtitle: {
      fontSize: 13,
      fontWeight: '500',
      marginTop: 2,
    },
    detailGrid: { gap: 12 },
    detailField: { gap: 2 },
    detailLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    detailValue: {
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
    },
    releaseBlock: {
      borderRadius: 14,
      padding: 12,
      marginTop: 10,
    },
    releaseRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    releaseLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: '#059669',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
      letterSpacing: -0.1,
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
      backgroundColor: isDark ? colors.card : colors.surface,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 15,
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 14,
      letterSpacing: -0.2,
    },
    inputMultiline: {
      minHeight: 96,
      textAlignVertical: 'top',
      paddingTop: 14,
    },
    photoPreview: {
      width: '100%',
      height: 200,
      borderRadius: 18,
      marginBottom: 10,
      backgroundColor: colors.border,
    },
    secondaryBtn: {
      backgroundColor: isDark ? colors.card : colors.surface,
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
      marginBottom: 8,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    secondaryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
    pickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    pickerSheet: {
      maxHeight: '78%',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
    },
    pickerHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)',
      marginBottom: 10,
    },
    pickerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    pickerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
    pickerItem: {
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 14,
    },
  });
