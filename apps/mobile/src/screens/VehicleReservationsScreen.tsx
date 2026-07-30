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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  periodoUso: string[];
  polo?: string | null;
  contrato?: string | null;
  observacaoCapacidadeVeiculo?: string | null;
  status: VehicleReservationStatus;
  createdById?: string;
  createdBy?: { id: string; name: string } | null;
  vehicle?: {
    id: string;
    placaVeic: string;
    marcaVeic?: string | null;
    modeloVeic?: string | null;
  } | null;
};

type EmployeeOption = { id: string; name: string };
type CostCenterOption = { label: string };

type FormState = {
  solicitante: string;
  motorista: string;
  atividade: string;
  localDestino: string;
  dataUsoInicio: string;
  dataUsoFim: string;
  periodoUso: string[];
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

const PERIODO_OPTIONS = [
  { value: 'INTEGRAL', label: 'Integral' },
  { value: 'MATUTINO', label: 'Matutino' },
  { value: 'VESPERTINO', label: 'Vespertino' },
  { value: 'NOTURNO', label: 'Noturno' },
];

const POLO_OPTIONS = [
  { value: 'DF', label: 'DF' },
  { value: 'GO', label: 'GO' },
];

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nowDatetimeLocal() {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function EMPTY_FORM(userName = ''): FormState {
  return {
    solicitante: userName,
    motorista: '',
    atividade: '',
    localDestino: '',
    dataUsoInicio: todayInputValue(),
    dataUsoFim: todayInputValue(),
    periodoUso: [],
    polo: '',
    contrato: '',
    observacaoCapacidadeVeiculo: '',
  };
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function formatPeriodo(values?: string[]) {
  if (!values?.length) return '—';
  return values
    .map((v) => PERIODO_OPTIONS.find((p) => p.value === v)?.label || v)
    .join(', ');
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
          backgroundColor: isDark ? colors.card : '#EEF0F3',
          borderRadius: 14,
          paddingHorizontal: 14,
          paddingVertical: 15,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
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

function SignaturePad({
  colors,
  onChange,
}: {
  colors: any;
  onChange: (dataUrl: string) => void;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const currentPath = useRef('');
  const [size, setSize] = useState({ w: 1, h: 1 });

  const exportSvg = useCallback(
    (allPaths: string[]) => {
      if (!allPaths.length) {
        onChange('');
        return;
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.w}" height="${size.h}" viewBox="0 0 ${size.w} ${size.h}"><rect width="100%" height="100%" fill="white"/>${allPaths
        .map(
          (d) =>
            `<path d="${d}" stroke="#111" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
        )
        .join('')}</svg>`;
      const encoded =
        typeof btoa === 'function'
          ? btoa(unescape(encodeURIComponent(svg)))
          : Buffer.from(svg, 'utf-8').toString('base64');
      onChange(`data:image/svg+xml;base64,${encoded}`);
    },
    [onChange, size.h, size.w],
  );

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        currentPath.current = `M ${locationX} ${locationY}`;
        setPaths((p) => [...p, currentPath.current]);
      },
      onPanResponderMove: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        currentPath.current += ` L ${locationX} ${locationY}`;
        setPaths((p) => {
          const next = [...p];
          next[next.length - 1] = currentPath.current;
          return next;
        });
      },
      onPanResponderRelease: () => {
        setPaths((p) => {
          exportSvg(p);
          return p;
        });
      },
    }),
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const clear = () => {
    setPaths([]);
    onChange('');
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
  const styles = getStyles(colors, isDark);

  const [rows, setRows] = useState<VehicleReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM());
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [contracts, setContracts] = useState<CostCenterOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [returnTarget, setReturnTarget] = useState<VehicleReservation | null>(null);
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
      const [usersRes, ccRes] = await Promise.all([
        api.get('/api/users?page=1&limit=1000'),
        api.get('/api/cost-centers?isActive=true&limit=2000'),
      ]);
      const usersJson = await usersRes.json();
      const ccJson = await ccRes.json();

      if (usersRes.ok) {
        const users = usersJson?.data || [];
        const opts = users
          .filter((u: any) => u.employee?.id && u.employee?.position !== 'Administrador')
          .map((u: any) => ({
            id: String(u.employee.id),
            name: String(u.name || '').trim(),
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
    setForm(EMPTY_FORM(user?.name || ''));
    setShowForm(true);
    void loadFormOptions();
  };

  useEffect(() => {
    const sub = onFabBarPress('Reservas', openForm);
    return () => sub.remove();
  }, [user?.name, loadFormOptions]);

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
          STATUS_LABELS[r.status],
        ]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [rows, cardFilter, searchTerm]);

  const togglePeriodo = (value: string) => {
    setForm((f) => ({
      ...f,
      periodoUso: f.periodoUso.includes(value)
        ? f.periodoUso.filter((p) => p !== value)
        : [...f.periodoUso, value],
    }));
  };

  const submitForm = async () => {
    if (!form.solicitante) {
      Toast.show({ type: 'error', text1: 'Selecione o solicitante' });
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
      Toast.show({ type: 'error', text1: 'Informe o período de datas' });
      return;
    }
    if (form.dataUsoFim < form.dataUsoInicio) {
      Toast.show({ type: 'error', text1: 'Data final inválida' });
      return;
    }
    if (!form.periodoUso.length) {
      Toast.show({ type: 'error', text1: 'Selecione o período de uso' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/api/vehicle-reservations', {
        solicitante: form.solicitante,
        motorista: form.motorista,
        atividade: form.atividade.trim(),
        localDestino: form.localDestino.trim(),
        dataUsoInicio: form.dataUsoInicio,
        dataUsoFim: form.dataUsoFim,
        periodoUso: form.periodoUso,
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
          {counts.total} {counts.total === 1 ? 'reserva' : 'reservas'}
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

        <View style={styles.searchBox}>
          <Search size={16} color={colors.textSecondary} strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar motorista, placa, status..."
            placeholderTextColor={colors.textSecondary}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color={colors.primary} />
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
                  <View style={styles.dot} />
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {formatPeriodo(row.periodoUso)}
                  </Text>
                </View>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {row.motorista} · {row.localDestino}
                </Text>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {row.vehicle?.placaVeic || 'Placa a definir'}
                </Text>
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

      {/* Form criar */}
      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
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
                style={[styles.formCloseBtn, { backgroundColor: colors.card }]}
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
                    label="Solicitante"
                    valueLabel={form.solicitante}
                    placeholder="Selecione"
                    colors={colors}
                    isDark={isDark}
                    onPress={() => {
                      setPickerSearch('');
                      setPicker({
                        title: 'Solicitante',
                        options: employees.map((e) => ({ value: e.name, label: e.name })),
                        onSelect: (solicitante) => setForm((f) => ({ ...f, solicitante })),
                      });
                    }}
                  />
                  <SelectField
                    label="Motorista"
                    valueLabel={form.motorista}
                    placeholder="Selecione"
                    colors={colors}
                    isDark={isDark}
                    onPress={() => {
                      setPickerSearch('');
                      setPicker({
                        title: 'Motorista',
                        options: employees.map((e) => ({ value: e.name, label: e.name })),
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
                    label="Data início"
                    value={form.dataUsoInicio}
                    onChange={(dataUsoInicio) =>
                      setForm((f) => ({
                        ...f,
                        dataUsoInicio,
                        dataUsoFim: f.dataUsoFim < dataUsoInicio ? dataUsoInicio : f.dataUsoFim,
                      }))
                    }
                    placeholder="Selecionar data"
                  />
                  <DateField
                    label="Data fim"
                    value={form.dataUsoFim}
                    onChange={(dataUsoFim) => setForm((f) => ({ ...f, dataUsoFim }))}
                    placeholder="Selecionar data"
                    minimumDate={
                      form.dataUsoInicio
                        ? new Date(
                            +form.dataUsoInicio.slice(0, 4),
                            +form.dataUsoInicio.slice(5, 7) - 1,
                            +form.dataUsoInicio.slice(8, 10),
                          )
                        : undefined
                    }
                  />

                  <Text style={styles.fieldLabel}>Período de uso</Text>
                  <View style={styles.periodoRow}>
                    {PERIODO_OPTIONS.map((p) => {
                      const active = form.periodoUso.includes(p.value);
                      return (
                        <TouchableOpacity
                          key={p.value}
                          onPress={() => togglePeriodo(p.value)}
                          style={[styles.periodoChip, active && styles.periodoChipActive]}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.periodoText, active && styles.periodoTextActive]}>
                            {p.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

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
                    label="Contrato / CC (opcional)"
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

                  <Text style={styles.fieldLabel}>Obs. capacidade do veículo (opcional)</Text>
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
        </SafeAreaView>
      </Modal>

      {/* Modal baixa */}
      <Modal
        visible={!!returnTarget}
        animationType="slide"
        onRequestClose={() => setReturnTarget(null)}
      >
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.formHeader}>
              <View style={styles.formHeaderText}>
                <Text style={styles.formTitle}>Dar baixa</Text>
                <Text style={styles.formSubtitle}>
                  Reserva #{returnTarget?.code} · {returnTarget?.vehicle?.placaVeic || 'Veículo'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReturnTarget(null)}
                style={[styles.formCloseBtn, { backgroundColor: colors.card }]}
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
                multiline
                placeholderTextColor={colors.textSecondary}
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
        </SafeAreaView>
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
                style={[styles.formCloseBtn, { backgroundColor: colors.card, width: 36, height: 36, borderRadius: 18 }]}
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
                  style={[styles.pickerItem, { backgroundColor: isDark ? colors.card : '#EEF0F3' }]}
                  onPress={() => {
                    picker?.onSelect(item.value);
                    setPicker(null);
                  }}
                  activeOpacity={0.75}
                >
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600', letterSpacing: -0.2 }}>
                    {item.label}
                  </Text>
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
    chipsRow: { gap: 8, paddingBottom: 14 },
    iconBtn: { padding: 8, width: 40, alignItems: 'center' },
    formHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 16,
    },
    formCloseBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
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
      backgroundColor: isDark ? colors.card : '#EEF0F3',
    },
    chipActive: { backgroundColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: '#fff' },
    chipCount: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      opacity: 0.7,
    },
    chipCountActive: { color: 'rgba(255,255,255,0.85)', opacity: 1 },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: isDark ? colors.card : '#EEF0F3',
      borderRadius: 14,
      paddingHorizontal: 14,
      marginBottom: 20,
    },
    searchInput: {
      flex: 1,
      paddingVertical: Platform.OS === 'ios' ? 13 : 10,
      color: colors.text,
      fontSize: 15,
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
      backgroundColor: isDark ? colors.card : '#EEF0F3',
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
    returnBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
      letterSpacing: -0.1,
    },
    input: {
      borderWidth: 0,
      backgroundColor: isDark ? colors.card : '#EEF0F3',
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
    periodoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    periodoChip: {
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: isDark ? colors.card : '#EEF0F3',
    },
    periodoChipActive: { backgroundColor: colors.primary },
    periodoText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    periodoTextActive: { color: '#fff' },
    photoPreview: {
      width: '100%',
      height: 200,
      borderRadius: 18,
      marginBottom: 10,
      backgroundColor: colors.border,
    },
    secondaryBtn: {
      backgroundColor: isDark ? colors.card : '#EEF0F3',
      borderRadius: 14,
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
      marginBottom: 8,
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
