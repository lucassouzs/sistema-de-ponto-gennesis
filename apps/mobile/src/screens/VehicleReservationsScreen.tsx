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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path } from 'react-native-svg';
import {
  Car,
  Plus,
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
}: {
  label: string;
  valueLabel: string;
  placeholder: string;
  onPress: () => void;
  colors: any;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 }}>
        {label}
      </Text>
      <TouchableOpacity
        onPress={onPress}
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          borderRadius: 10,
          paddingHorizontal: 14,
          paddingVertical: 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{ flex: 1, fontSize: 15, color: valueLabel ? colors.text : colors.textSecondary }}
          numberOfLines={1}
        >
          {valueLabel || placeholder}
        </Text>
        <ChevronDown size={18} color={colors.textSecondary} />
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
  const styles = getStyles(colors);

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
        <Text style={styles.pageTitle}>Reserva de veículo</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {chips.map(({ key, label, count, Icon }) => {
            const active = cardFilter === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setCardFilter(key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Icon size={14} color={active ? '#fff' : colors.textSecondary} />
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {label} ({count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.searchBox}>
          <Search size={18} color={colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar motorista, placa, status..."
            placeholderTextColor={colors.textSecondary}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={openForm}>
          <Plus size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Nova reserva</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : filteredRows.length === 0 ? (
          <View style={styles.empty}>
            <Car size={40} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>Nenhuma reserva</Text>
            <Text style={styles.emptyText}>Toque em Nova reserva para solicitar um veículo.</Text>
          </View>
        ) : (
          filteredRows.map((row) => (
            <View key={row.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardNumber}>#{row.code}</Text>
                <View style={[styles.badge, { backgroundColor: `${statusColor(row.status)}22` }]}>
                  <Text style={[styles.badgeText, { color: statusColor(row.status) }]}>
                    {STATUS_LABELS[row.status]}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardRoute}>{row.atividade}</Text>
              <Text style={styles.cardMeta}>
                {formatDateLabel(row.dataUsoInicio)} → {formatDateLabel(row.dataUsoFim)} ·{' '}
                {formatPeriodo(row.periodoUso)}
              </Text>
              <Text style={styles.cardMeta}>
                Motorista: {row.motorista} · Destino: {row.localDestino}
              </Text>
              <Text style={styles.cardMeta}>
                Veículo: {row.vehicle?.placaVeic || 'A definir'}
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
                >
                  <ClipboardCheck size={16} color="#fff" />
                  <Text style={styles.returnBtnText}>Dar baixa</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      {/* Form criar */}
      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { backgroundColor: colors.headerBackground }]}>
            <TouchableOpacity onPress={() => setShowForm(false)} style={styles.iconBtn}>
              <X size={24} color={colors.headerText} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Nova reserva</Text>
            <View style={{ width: 40 }} />
          </View>

          {loadingOptions ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
              <SelectField
                label="Solicitante"
                valueLabel={form.solicitante}
                placeholder="Selecione"
                colors={colors}
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
                onPress={() => {
                  setPickerSearch('');
                  setPicker({
                    title: 'Motorista',
                    options: employees.map((e) => ({ value: e.name, label: e.name })),
                    onSelect: (motorista) => setForm((f) => ({ ...f, motorista })),
                  });
                }}
              />

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

              <Text style={styles.fieldLabel}>Data início (AAAA-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={form.dataUsoInicio}
                onChangeText={(dataUsoInicio) => setForm((f) => ({ ...f, dataUsoInicio }))}
                placeholderTextColor={colors.textSecondary}
              />
              <Text style={styles.fieldLabel}>Data fim (AAAA-MM-DD)</Text>
              <TextInput
                style={styles.input}
                value={form.dataUsoFim}
                onChangeText={(dataUsoFim) => setForm((f) => ({ ...f, dataUsoFim }))}
                placeholderTextColor={colors.textSecondary}
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
                    >
                      <Text style={[styles.periodoText, active && styles.periodoTextActive]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <SelectField
                label="Polo (opcional)"
                valueLabel={form.polo}
                placeholder="Selecione"
                colors={colors}
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
                style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
                value={form.observacaoCapacidadeVeiculo}
                onChangeText={(observacaoCapacidadeVeiculo) =>
                  setForm((f) => ({ ...f, observacaoCapacidadeVeiculo }))
                }
                placeholder="Ex.: precisa de 5 lugares"
                placeholderTextColor={colors.textSecondary}
                multiline
              />

              <TouchableOpacity
                style={[styles.primaryBtn, submitting && { opacity: 0.7 }]}
                onPress={submitForm}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Enviar reserva</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      {/* Modal baixa */}
      <Modal
        visible={!!returnTarget}
        animationType="slide"
        onRequestClose={() => setReturnTarget(null)}
      >
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { backgroundColor: colors.headerBackground }]}>
            <TouchableOpacity onPress={() => setReturnTarget(null)} style={styles.iconBtn}>
              <X size={24} color={colors.headerText} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Dar baixa</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <Text style={styles.cardMeta}>
              Reserva #{returnTarget?.code} · {returnTarget?.vehicle?.placaVeic || 'Veículo'}
            </Text>

            <Text style={styles.fieldLabel}>Data/hora devolução</Text>
            <TextInput
              style={styles.input}
              value={returnForm.devolucaoAt}
              onChangeText={(devolucaoAt) => setReturnForm((f) => ({ ...f, devolucaoAt }))}
              placeholder="AAAA-MM-DDTHH:mm"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={styles.fieldLabel}>Foto do veículo</Text>
            {returnForm.baixaFoto ? (
              <Image source={{ uri: returnForm.baixaFoto }} style={styles.photoPreview} />
            ) : null}
            <TouchableOpacity style={styles.secondaryBtn} onPress={takeReturnPhoto}>
              <Camera size={16} color={colors.primary} />
              <Text style={styles.secondaryBtnText}>Tirar foto</Text>
            </TouchableOpacity>

            <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Assinatura</Text>
            <SignaturePad
              colors={colors}
              onChange={(baixaAssinatura) => setReturnForm((f) => ({ ...f, baixaAssinatura }))}
            />

            <Text style={styles.fieldLabel}>Observação (opcional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]}
              value={returnForm.baixaObservacao}
              onChangeText={(baixaObservacao) =>
                setReturnForm((f) => ({ ...f, baixaObservacao }))
              }
              multiline
              placeholderTextColor={colors.textSecondary}
            />

            <TouchableOpacity
              style={[styles.primaryBtn, returning && { opacity: 0.7 }]}
              onPress={submitReturn}
              disabled={returning}
            >
              {returning ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Confirmar baixa</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Picker */}
      <Modal visible={!!picker} animationType="slide" transparent onRequestClose={() => setPicker(null)}>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { backgroundColor: colors.card }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>{picker?.title}</Text>
              <TouchableOpacity onPress={() => setPicker(null)}>
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <View style={[styles.searchBox, { marginBottom: 8 }]}>
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
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    picker?.onSelect(item.value);
                    setPicker(null);
                  }}
                >
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '500' }}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ textAlign: 'center', color: colors.textSecondary, padding: 20 }}>
                  Nenhum resultado
                </Text>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: { padding: 16, paddingBottom: 40 },
    pageTitle: {
      color: colors.text,
      fontSize: 24,
      fontWeight: '700',
      letterSpacing: -0.4,
      marginBottom: 14,
    },
    chipsRow: { gap: 8, paddingBottom: 12 },
    iconBtn: { padding: 8, width: 40, alignItems: 'center' },
    headerTitle: { color: colors.headerText, fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center' },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: '#fff' },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    searchInput: {
      flex: 1,
      paddingVertical: Platform.OS === 'ios' ? 12 : 8,
      color: colors.text,
      fontSize: 15,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    empty: { alignItems: 'center', paddingVertical: 48, gap: 8 },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    emptyText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
    card: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 6,
    },
    cardNumber: { fontWeight: '700', color: colors.text, fontSize: 15 },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
    badgeText: { fontSize: 11, fontWeight: '700' },
    cardRoute: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: 4 },
    cardMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    returnBtn: {
      marginTop: 12,
      backgroundColor: '#059669',
      borderRadius: 10,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    returnBtnText: { color: '#fff', fontWeight: '700' },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: 4,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
      marginBottom: 14,
    },
    periodoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    periodoChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    periodoChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    periodoText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    periodoTextActive: { color: '#fff' },
    photoPreview: {
      width: '100%',
      height: 180,
      borderRadius: 12,
      marginBottom: 10,
      backgroundColor: colors.border,
    },
    secondaryBtn: {
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
      marginBottom: 8,
    },
    secondaryBtnText: { color: colors.primary, fontWeight: '700' },
    pickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    pickerSheet: {
      maxHeight: '75%',
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      padding: 16,
    },
    pickerHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
    },
    pickerTitle: { fontSize: 17, fontWeight: '700' },
    pickerItem: {
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: '#e5e7eb',
    },
  });
