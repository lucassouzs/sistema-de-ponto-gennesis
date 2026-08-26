import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Alert,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import {
  Fuel,
  Search,
  Camera,
  X,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  ImagePlus,
  MapPin,
  Trash2,
  Filter,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { onFabBarPress } from '../navigation/fabBarEvents';
import AppHeader from '../components/AppHeader';
import DateField from '../components/DateField';
type FuelVehicleType = 'PRIVATE' | 'COMPANY';
type FuelRefuelStatus =
  | 'PENDING_MANAGER'
  | 'PENDING_SUPPLIES'
  | 'AWAITING_REFUEL'
  | 'COMPLETED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED';

type CardFilter = 'all' | 'pending' | 'liberado' | 'concluded' | 'cancelled';

type FuelRefuelDeadlineUnit = 'HOURS' | 'DAYS';
type FuelTankLevelAfter = 'RESERVE' | 'QUARTER' | 'HALF' | 'THREE_QUARTERS' | 'FULL';

type FuelRequestRow = {
  id: string;
  displayNumber: number;
  refuelDate: string;
  route: string;
  driverName: string;
  vehiclePlate: string;
  vehicleDescription?: string | null;
  vehicleType: FuelVehicleType;
  status: FuelRefuelStatus;
  satelliteCityName?: string | null;
  costCenter?: string | null;
  contract?: {
    id: string;
    name: string;
    number?: string | null;
  } | null;
  observations?: string | null;
  gasStation?: {
    id: string;
    displayNumber?: number;
    name: string;
    address?: string | null;
    cityCode?: string | null;
  } | null;
  refuelDeadlineAt?: string | null;
  refuelDeadlineAmount?: number | null;
  refuelDeadlineUnit?: FuelRefuelDeadlineUnit | null;
  suppliesApprovalComment?: string | null;
};

type ReportFormState = {
  odometerKm: string;
  tankLevelAfter: FuelTankLevelAfter | '';
  litersRefueled: string;
  pricePerLiter: string;
  receiptPhoto: string;
  observations: string;
};

type SatelliteCity = { code: string; stateCode: string; name: string; stationCount?: number };
type DriverOption = { id: string; name: string; cpf: string; costCenter: string | null };
type FleetVehicle = {
  id: string;
  placaVeic: string;
  marcaVeic?: string | null;
  modeloVeic?: string | null;
  frotaPartic?: 'FROTA' | 'PARTICULAR' | null;
};

type FormState = {
  refuelDate: string;
  route: string;
  stateCode: string;
  satelliteCityCode: string;
  contractId: string;
  driverUserId: string;
  driverNamePreview: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleDescription: string;
  vehicleType: FuelVehicleType | '';
  dashboardPhoto: string;
  observations: string;
};

const STATUS_LABELS: Record<FuelRefuelStatus, string> = {
  PENDING_MANAGER: 'Aguardando gestor',
  PENDING_SUPPLIES: 'Aguardando Suprimentos',
  AWAITING_REFUEL: 'Abastecimento Liberado',
  COMPLETED: 'Concluída',
  APPROVED: 'Aguardando Suprimentos',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

const VEHICLE_TYPE_LABELS: Record<FuelVehicleType, string> = {
  PRIVATE: 'Particular',
  COMPANY: 'Frota',
};

function extractContractDisplayName(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return '';
  const parts = trimmed.split(/\s*[—–-]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return trimmed;
  if (/^\d+\/\d+/.test(parts[0])) return parts.slice(1).join(' — ');
  return parts[parts.length - 1];
}

function fuelContractLabel(row: {
  costCenter?: string | null;
  contract?: { number?: string | null; name?: string | null } | null;
}): string {
  const name = row.contract?.name?.trim();
  const number = row.contract?.number?.trim();
  if (name) return extractContractDisplayName(name);
  if (row.costCenter?.trim()) return extractContractDisplayName(row.costCenter.trim());
  if (number) return number;
  return '—';
}

const TANK_LEVEL_OPTIONS: Array<{ value: FuelTankLevelAfter; label: string }> = [
  { value: 'RESERVE', label: 'Reserva' },
  { value: 'QUARTER', label: '1/4 do tanque' },
  { value: 'HALF', label: '1/2 do tanque' },
  { value: 'THREE_QUARTERS', label: '3/4 do tanque' },
  { value: 'FULL', label: 'Tanque cheio' },
];

function todayInputValue() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function EMPTY_FORM(): FormState {
  return {
    refuelDate: todayInputValue(),
    route: '',
    stateCode: '',
    satelliteCityCode: '',
    contractId: '',
    driverUserId: '',
    driverNamePreview: '',
    vehicleId: '',
    vehiclePlate: '',
    vehicleDescription: '',
    vehicleType: '',
    dashboardPhoto: '',
    observations: '',
  };
}

function EMPTY_REPORT_FORM(): ReportFormState {
  return {
    odometerKm: '',
    tankLevelAfter: '',
    litersRefueled: '',
    pricePerLiter: '',
    receiptPhoto: '',
    observations: '',
  };
}

function parseBrDecimal(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, '');
  if (!cleaned) return null;
  if (cleaned.includes(',')) {
    const n = Number(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function isPendingStatus(status: FuelRefuelStatus) {
  return (
    status === 'PENDING_MANAGER' ||
    status === 'PENDING_SUPPLIES' ||
    status === 'APPROVED'
  );
}

function isLiberadoStatus(status: FuelRefuelStatus) {
  return status === 'AWAITING_REFUEL';
}

function isCancelledStatus(status: FuelRefuelStatus) {
  return status === 'CANCELLED' || status === 'REJECTED';
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function formatDateTimeLabel(value: string) {
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

function formatRefuelDeadline(
  amount?: number | null,
  unit?: FuelRefuelDeadlineUnit | null,
  deadlineAt?: string | null,
): string | null {
  if (!amount || !unit) return null;
  const unitLabel =
    unit === 'HOURS' ? (amount === 1 ? 'hora' : 'horas') : amount === 1 ? 'dia' : 'dias';
  const base = `${amount} ${unitLabel}`;
  if (!deadlineAt) return base;
  return `${base} (até ${formatDateTimeLabel(deadlineAt)})`;
}

function mapFrotaParticToFuelType(frotaPartic?: 'FROTA' | 'PARTICULAR' | null): FuelVehicleType {
  return frotaPartic === 'PARTICULAR' ? 'PRIVATE' : 'COMPANY';
}

function statusColor(status: FuelRefuelStatus, colors: any) {
  if (status === 'COMPLETED') return colors.success;
  if (status === 'REJECTED' || status === 'CANCELLED') return colors.error;
  if (status === 'AWAITING_REFUEL') return '#059669';
  if (status === 'PENDING_SUPPLIES' || status === 'APPROVED') return '#2563eb';
  return '#d97706';
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

export default function FuelRequestsScreen() {
  const navigation = useNavigation();
  const navState = navigation.getState?.();
  const isTabScreen = navState?.type === 'tab';
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const styles = getStyles(colors, isDark);

  const [rows, setRows] = useState<FuelRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | FuelRefuelStatus>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM());
  const [reportTarget, setReportTarget] = useState<FuelRequestRow | null>(null);
  const [reportForm, setReportForm] = useState<ReportFormState>(EMPTY_REPORT_FORM());
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [detailTarget, setDetailTarget] = useState<FuelRequestRow | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<SatelliteCity[]>([]);
  const [contracts, setContracts] = useState<Array<{ id: string; name: string; number?: string }>>(
    [],
  );
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const [picker, setPicker] = useState<{
    title: string;
    options: PickerOption[];
    onSelect: (value: string) => void;
  } | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  const loadList = useCallback(async () => {
    try {
      const res = await api.get('/api/fuel-refuel-requests/mine');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || 'Erro ao carregar');
      setRows((data?.data || []) as FuelRequestRow[]);
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Erro',
        text2: e?.message || 'Não foi possível carregar solicitações',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadFormOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const [citiesRes, driversRes, vehiclesRes, contractsRes] = await Promise.all([
        api.get('/api/fuel-refuel-requests/satellite-cities'),
        api.get('/api/fuel-refuel-requests/driver-options'),
        api.get('/api/vehicles?isActive=true&limit=100&page=1'),
        api.get('/api/contracts?limit=500&page=1'),
      ]);
      const citiesJson = await citiesRes.json();
      const driversJson = await driversRes.json();
      const vehiclesJson = await vehiclesRes.json();
      const contractsJson = await contractsRes.json();

      if (citiesRes.ok) {
        setStates(citiesJson?.data?.states || []);
        setCities(citiesJson?.data?.cities || []);
      }
      if (contractsRes.ok) {
        setContracts(contractsJson?.data || []);
      }
      if (driversRes.ok) {
        const list = (driversJson?.data || []) as DriverOption[];
        setDrivers(list);
        setForm((f) => {
          if (f.driverUserId) return f;
          const me = user?.id ? list.find((d) => d.id === user.id) : undefined;
          if (!me) return f;
          return {
            ...f,
            driverUserId: me.id,
            driverNamePreview: me.name,
          };
        });
      }
      if (vehiclesRes.ok) {
        setVehicles((vehiclesJson?.data || []) as FleetVehicle[]);
      }
    } catch {
      Toast.show({ type: 'error', text1: 'Erro ao carregar opções do formulário' });
    } finally {
      setLoadingOptions(false);
    }
  }, [user?.id]);

  const openForm = () => {
    setForm(EMPTY_FORM());
    setShowForm(true);
    void loadFormOptions();
  };

  useEffect(() => {
    const sub = onFabBarPress('Combustivel', openForm);
    return () => sub.remove();
  }, [loadFormOptions]);

  const counts = useMemo(() => {
    const pending = rows.filter((r) => isPendingStatus(r.status)).length;
    const liberado = rows.filter((r) => isLiberadoStatus(r.status)).length;
    const concluded = rows.filter((r) => r.status === 'COMPLETED').length;
    const cancelled = rows.filter((r) => isCancelledStatus(r.status)).length;
    return { total: rows.length, pending, liberado, concluded, cancelled };
  }, [rows]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (cardFilter === 'pending') list = list.filter((r) => isPendingStatus(r.status));
    if (cardFilter === 'liberado') list = list.filter((r) => isLiberadoStatus(r.status));
    if (cardFilter === 'concluded') list = list.filter((r) => r.status === 'COMPLETED');
    if (cardFilter === 'cancelled') list = list.filter((r) => isCancelledStatus(r.status));
    if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter);
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [
          String(r.displayNumber),
          r.route,
          r.driverName,
          r.vehiclePlate,
          r.vehicleDescription || '',
          fuelContractLabel(r),
          STATUS_LABELS[r.status],
          r.satelliteCityName || '',
          r.gasStation?.name || '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [rows, cardFilter, searchTerm, statusFilter]);

  const citiesForState = useMemo(
    () => cities.filter((c) => !form.stateCode || c.stateCode === form.stateCode),
    [cities, form.stateCode],
  );

  const takeDashboardPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da câmera para a foto do painel.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setForm((f) => ({
        ...f,
        dashboardPhoto: `data:image/jpeg;base64,${result.assets[0].base64}`,
      }));
    }
  };

  const pickDashboardPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da galeria para anexar a foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setForm((f) => ({
        ...f,
        dashboardPhoto: `data:image/jpeg;base64,${result.assets[0].base64}`,
      }));
    }
  };

  const takeReceiptPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da câmera para a foto do cupom.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setReportForm((f) => ({
        ...f,
        receiptPhoto: `data:image/jpeg;base64,${result.assets[0].base64}`,
      }));
    }
  };

  const pickReceiptPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da galeria para anexar a foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]?.base64) {
      setReportForm((f) => ({
        ...f,
        receiptPhoto: `data:image/jpeg;base64,${result.assets[0].base64}`,
      }));
    }
  };

  const submitForm = async () => {
    if (!form.refuelDate) {
      Toast.show({ type: 'error', text1: 'Informe a data do abastecimento' });
      return;
    }
    if (form.route.trim().length < 2) {
      Toast.show({ type: 'error', text1: 'Informe a rota' });
      return;
    }
    if (!form.satelliteCityCode) {
      Toast.show({ type: 'error', text1: 'Selecione a cidade' });
      return;
    }
    if (!form.contractId) {
      Toast.show({ type: 'error', text1: 'Selecione o contrato' });
      return;
    }
    if (!form.driverUserId) {
      Toast.show({ type: 'error', text1: 'Selecione o condutor' });
      return;
    }
    if (!form.vehicleId || !form.vehiclePlate.trim()) {
      Toast.show({ type: 'error', text1: 'Selecione o veículo' });
      return;
    }
    if (!form.vehicleType) {
      Toast.show({ type: 'error', text1: 'Veículo sem tipo (frota/particular)' });
      return;
    }
    if (!form.dashboardPhoto.startsWith('data:image/')) {
      Toast.show({ type: 'error', text1: 'Envie a foto do painel' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/api/fuel-refuel-requests', {
        refuelDate: form.refuelDate,
        route: form.route.trim(),
        satelliteCityCode: form.satelliteCityCode,
        contractId: form.contractId,
        vehiclePlate: form.vehiclePlate.trim().toUpperCase(),
        vehicleDescription: form.vehicleDescription.trim() || undefined,
        vehicleType: form.vehicleType,
        dashboardPhotoBase64: form.dashboardPhoto,
        observations: form.observations.trim() || undefined,
        driverUserId: form.driverUserId,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || 'Erro ao registrar');
      Toast.show({ type: 'success', text1: data?.message || 'Solicitação registrada' });
      setShowForm(false);
      setForm(EMPTY_FORM());
      setLoading(true);
      void loadList();
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Erro',
        text2: e?.message || 'Não foi possível registrar',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const openReportForm = (row: FuelRequestRow) => {
    setReportForm(EMPTY_REPORT_FORM());
    setReportTarget(row);
  };

  const submitReportForm = async () => {
    if (!reportTarget) return;
    const odometerKm = Number(reportForm.odometerKm.replace(/\D/g, ''));
    if (!Number.isFinite(odometerKm) || odometerKm <= 0) {
      Toast.show({ type: 'error', text1: 'Informe o hodômetro em km' });
      return;
    }
    if (!reportForm.tankLevelAfter) {
      Toast.show({ type: 'error', text1: 'Selecione o nível do tanque' });
      return;
    }
    const litersRefueled = parseBrDecimal(reportForm.litersRefueled);
    if (litersRefueled == null || litersRefueled <= 0) {
      Toast.show({ type: 'error', text1: 'Informe os litros abastecidos' });
      return;
    }
    const pricePerLiter = parseBrDecimal(reportForm.pricePerLiter);
    if (pricePerLiter == null || pricePerLiter <= 0) {
      Toast.show({ type: 'error', text1: 'Informe o valor por litro' });
      return;
    }
    if (!reportForm.receiptPhoto.startsWith('data:image/')) {
      Toast.show({ type: 'error', text1: 'Envie a foto do cupom fiscal' });
      return;
    }

    setReportSubmitting(true);
    try {
      const res = await api.post(`/api/fuel-refuel-requests/${reportTarget.id}/report`, {
        odometerKm,
        tankLevelAfter: reportForm.tankLevelAfter,
        litersRefueled,
        pricePerLiter,
        receiptPhotoBase64: reportForm.receiptPhoto,
        observations: reportForm.observations.trim() || undefined,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || 'Erro ao informar');
      Toast.show({ type: 'success', text1: data?.message || 'Abastecimento informado' });
      setReportTarget(null);
      setReportForm(EMPTY_REPORT_FORM());
      setLoading(true);
      void loadList();
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Erro',
        text2: e?.message || 'Não foi possível informar o abastecimento',
      });
    } finally {
      setReportSubmitting(false);
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

  const filterChips: { key: CardFilter; label: string; count: number; Icon: any }[] = [
    { key: 'all', label: 'Todas', count: counts.total, Icon: Fuel },
    { key: 'pending', label: 'Pendentes', count: counts.pending, Icon: Clock },
    { key: 'liberado', label: 'Liberado', count: counts.liberado, Icon: Fuel },
    { key: 'concluded', label: 'Concluídas', count: counts.concluded, Icon: CheckCircle },
    { key: 'cancelled', label: 'Canceladas', count: counts.cancelled, Icon: XCircle },
  ];

  const canCancel = (row: FuelRequestRow) => row.status === 'PENDING_MANAGER';

  const closeForm = () => {
    setShowForm(false);
    setPicker(null);
    setPickerSearch('');
  };

  const closeReport = () => {
    if (reportSubmitting) return;
    setReportTarget(null);
    setPicker(null);
    setPickerSearch('');
  };

  const renderPickerOverlay = () => {
    if (!picker) return null;
    return (
      <View style={[styles.pickerOverlay, styles.pickerOverlayAbsolute]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setPicker(null)}
        />
        <View
          style={[
            styles.pickerSheet,
            {
              backgroundColor: colors.background,
              height: Math.round(windowHeight * 0.72),
            },
          ]}
        >
          <View style={styles.pickerHandle} />
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>{picker.title}</Text>
            <TouchableOpacity
              onPress={() => setPicker(null)}
              style={[styles.formCloseBtn, { width: 36, height: 36 }]}
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
            style={{ flex: 1 }}
            data={pickerFiltered}
            keyExtractor={(item) => item.value}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.pickerItem,
                  { backgroundColor: isDark ? colors.card : colors.surface },
                ]}
                onPress={() => {
                  picker.onSelect(item.value);
                  setPicker(null);
                }}
                activeOpacity={0.75}
              >
                <Text
                  style={{
                    color: colors.text,
                    fontSize: 15,
                    fontWeight: '600',
                    letterSpacing: -0.2,
                  }}
                >
                  {item.label}
                </Text>
                {item.subtitle ? (
                  <Text
                    style={{
                      color: colors.textSecondary,
                      fontSize: 12,
                      marginTop: 3,
                      fontWeight: '500',
                    }}
                  >
                    {item.subtitle}
                  </Text>
                ) : null}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text
                style={{
                  textAlign: 'center',
                  color: colors.textSecondary,
                  padding: 28,
                  fontWeight: '500',
                }}
              >
                Nenhum resultado
              </Text>
            }
            contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24), gap: 8 }}
          />
        </View>
      </View>
    );
  };

  const cancelRequest = (row: FuelRequestRow) => {
    if (!canCancel(row)) {
      Toast.show({
        type: 'error',
        text1: 'Só é possível excluir solicitações aguardando o gestor',
      });
      return;
    }

    Alert.alert(
      'Excluir solicitação',
      `Tem certeza que deseja excluir a solicitação #${row.displayNumber}? Esta ação não pode ser desfeita.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setCancellingId(row.id);
            try {
              const res = await api.post(`/api/fuel-refuel-requests/${row.id}/cancel`, {});
              const data = await res.json().catch(() => ({}));
              if (!res.ok) {
                throw new Error(data?.message || data?.error || 'Erro ao excluir');
              }
              if (detailTarget?.id === row.id) setDetailTarget(null);
              Toast.show({ type: 'success', text1: 'Solicitação excluída' });
              setLoading(true);
              await loadList();
            } catch (e: any) {
              Toast.show({
                type: 'error',
                text1: 'Erro',
                text2: e?.message || 'Não foi possível excluir',
              });
            } finally {
              setCancellingId(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader
        showBack={!isTabScreen}
        onBack={() => navigation.goBack()}
        title={!isTabScreen ? 'Abastecimento' : undefined}
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
      >
        {isTabScreen ? (
          <>
            <Text style={styles.pageTitle}>Abastecimento</Text>
            <Text style={styles.pageSubtitle}>
              Solicite e acompanhe abastecimentos
            </Text>
          </>
        ) : (
          <Text style={styles.pageSubtitle}>
            Solicite e acompanhe abastecimentos
          </Text>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {filterChips.map(({ key, label, count }) => {
            const active = cardFilter === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setCardFilter(key)}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {label}
                </Text>
                <Text style={[styles.chipCount, active && styles.chipCountActive]}>
                  {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Search size={16} color={colors.textSecondary} strokeWidth={2} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar placa, rota, status..."
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
                ? 'Meus Abastecimentos'
                : filterChips.find((c) => c.key === cardFilter)?.label || 'Meus Abastecimentos'}
          </Text>
          <Text style={styles.listHeadingMeta}>{filteredRows.length}</Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
        ) : filteredRows.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Fuel size={28} color={colors.textSecondary} />
            </View>
            <Text style={styles.emptyTitle}>Nenhuma solicitação</Text>
            <Text style={styles.emptyText}>
              Toque no + para pedir abastecimento.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filteredRows.map((row) => (
              <View key={row.id} style={styles.card}>
                <TouchableOpacity
                  onPress={() => setDetailTarget(row)}
                  activeOpacity={0.85}
                >
                  <View style={styles.cardTop}>
                    <Text style={styles.cardNumber}>#{row.displayNumber}</Text>
                    <View
                      style={[
                        styles.badge,
                        { backgroundColor: `${statusColor(row.status, colors)}18` },
                      ]}
                    >
                      <Text style={[styles.badgeText, { color: statusColor(row.status, colors) }]}>
                        {STATUS_LABELS[row.status]}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardRoute} numberOfLines={2}>
                    {row.route}
                  </Text>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {formatDateLabel(row.refuelDate)}
                  </Text>
                  <Text style={styles.cardVehicle} numberOfLines={1}>
                    <Text style={styles.cardPlate}>{row.vehiclePlate}</Text>
                    {row.vehicleDescription?.trim() ? (
                      <Text style={styles.cardModel}>
                        {'  '}
                        {row.vehicleDescription.trim()}
                      </Text>
                    ) : null}
                  </Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    {[
                      row.driverName,
                      fuelContractLabel(row) !== '—' ? fuelContractLabel(row) : null,
                      row.satelliteCityName,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <Text style={[styles.cardHint, { color: colors.textSecondary }]}>
                    Toque para ver detalhes
                  </Text>
                </TouchableOpacity>
                {row.status === 'AWAITING_REFUEL' ? (
                  <TouchableOpacity
                    style={[styles.reportBtn, { marginTop: 12 }]}
                    onPress={() => openReportForm(row)}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.reportBtnText}>Informar abastecimento</Text>
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
              {(Object.keys(STATUS_LABELS) as FuelRefuelStatus[]).map((s) => (
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

      {/* Formulário */}
      <Modal
        visible={showForm}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeForm}
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
                <Text style={styles.formTitle}>Nova solicitação</Text>
                <Text style={styles.formSubtitle}>Dados do abastecimento</Text>
              </View>
              <TouchableOpacity
                onPress={closeForm}
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
                  <Text style={styles.sectionTitle}>Detalhes</Text>
                  <DateField
                    label="Data do abastecimento"
                    value={form.refuelDate}
                    onChange={(refuelDate) => setForm((f) => ({ ...f, refuelDate }))}
                    placeholder="Selecionar data"
                  />

                  <Text style={styles.fieldLabel}>Rota</Text>
                  <TextInput
                    style={styles.input}
                    value={form.route}
                    onChangeText={(route) => setForm((f) => ({ ...f, route }))}
                    placeholder="Descreva a rota do abastecimento"
                    placeholderTextColor={colors.textSecondary}
                  />

                  <Text style={styles.sectionTitle}>Local</Text>
                  <SelectField
                    label="Estado"
                    valueLabel={form.stateCode}
                    placeholder="Selecione o estado"
                    colors={colors}
                    isDark={isDark}
                    onPress={() => {
                      setPickerSearch('');
                      setPicker({
                        title: 'Estado',
                        options: states.map((s) => ({ value: s, label: s })),
                        onSelect: (stateCode) =>
                          setForm((f) => ({
                            ...f,
                            stateCode,
                            satelliteCityCode: '',
                          })),
                      });
                    }}
                  />

                  <SelectField
                    label="Cidade"
                    valueLabel={
                      cities.find((c) => c.code === form.satelliteCityCode)?.name || ''
                    }
                    placeholder="Selecione a cidade"
                    colors={colors}
                    isDark={isDark}
                    onPress={() => {
                      setPickerSearch('');
                      setPicker({
                        title: 'Cidade',
                        options: citiesForState.map((c) => ({
                          value: c.code,
                          label: c.name,
                        })),
                        onSelect: (satelliteCityCode) => {
                          const city = cities.find((c) => c.code === satelliteCityCode);
                          setForm((f) => ({
                            ...f,
                            satelliteCityCode,
                            stateCode: city?.stateCode || f.stateCode,
                          }));
                        },
                      });
                    }}
                  />

                  <SelectField
                    label="Contrato"
                    valueLabel={(() => {
                      const c = contracts.find((item) => item.id === form.contractId);
                      return c?.name || '';
                    })()}
                    placeholder="Selecione o contrato"
                    colors={colors}
                    isDark={isDark}
                    onPress={() => {
                      setPickerSearch('');
                      setPicker({
                        title: 'Contrato',
                        options: contracts.map((c) => ({
                          value: c.id,
                          label: c.name,
                          subtitle: '',
                        })),
                        onSelect: (contractId) => {
                          setForm((f) => ({ ...f, contractId }));
                        },
                      });
                    }}
                  />

                  <Text style={styles.sectionTitle}>Condutor e veículo</Text>
                  <SelectField
                    label="Condutor"
                    valueLabel={form.driverNamePreview}
                    placeholder="Selecione o condutor"
                    colors={colors}
                    isDark={isDark}
                    onPress={() => {
                      setPickerSearch('');
                      setPicker({
                        title: 'Condutor',
                        options: drivers.map((d) => ({
                          value: d.id,
                          label: d.name,
                          subtitle: d.cpf,
                        })),
                        onSelect: (driverUserId) => {
                          const d = drivers.find((x) => x.id === driverUserId);
                          setForm((f) => ({
                            ...f,
                            driverUserId,
                            driverNamePreview: d?.name || '',
                          }));
                        },
                      });
                    }}
                  />

                  <SelectField
                    label="Veículo (placa)"
                    valueLabel={form.vehiclePlate}
                    placeholder="Selecione o veículo"
                    colors={colors}
                    isDark={isDark}
                    onPress={() => {
                      setPickerSearch('');
                      setPicker({
                        title: 'Veículo',
                        options: vehicles.map((v) => ({
                          value: v.id,
                          label: v.placaVeic,
                          subtitle: [v.marcaVeic, v.modeloVeic].filter(Boolean).join(' · '),
                        })),
                        onSelect: (vehicleId) => {
                          const v = vehicles.find((x) => x.id === vehicleId);
                          if (!v) return;
                          const desc = [v.marcaVeic, v.modeloVeic].filter(Boolean).join(' ');
                          setForm((f) => ({
                            ...f,
                            vehicleId: v.id,
                            vehiclePlate: v.placaVeic,
                            vehicleDescription: desc,
                            vehicleType: mapFrotaParticToFuelType(v.frotaPartic),
                          }));
                        },
                      });
                    }}
                  />

                  {form.vehicleType ? (
                    <View style={styles.hintChip}>
                      <Text style={styles.hintChipText}>
                        Tipo: {form.vehicleType === 'PRIVATE' ? 'Particular' : 'Frota'}
                      </Text>
                    </View>
                  ) : null}
                  {form.vehicleDescription ? (
                    <View style={[styles.hintChip, { marginTop: 6 }]}>
                      <Text style={styles.hintChipText}>Modelo: {form.vehicleDescription}</Text>
                    </View>
                  ) : null}

                  <Text style={styles.sectionTitle}>Comprovante</Text>
                  <Text style={styles.fieldLabel}>Foto do painel</Text>
                  {form.dashboardPhoto ? (
                    <View style={styles.photoWrap}>
                      <Image source={{ uri: form.dashboardPhoto }} style={styles.photoPreview} />
                      <TouchableOpacity
                        style={styles.photoClear}
                        onPress={() => setForm((f) => ({ ...f, dashboardPhoto: '' }))}
                        accessibilityLabel="Remover foto"
                      >
                        <X size={16} color="#fff" strokeWidth={2.4} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.photoEmpty}>
                      <View style={[styles.photoEmptyIcon, { backgroundColor: colors.background }]}>
                        <ImagePlus size={22} color={colors.textSecondary} strokeWidth={2} />
                      </View>
                      <Text style={styles.photoEmptyTitle}>Adicione a foto do painel</Text>
                      <Text style={styles.photoEmptyText}>Tire uma foto ou escolha da galeria</Text>
                    </View>
                  )}
                  <View style={styles.photoActions}>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={takeDashboardPhoto} activeOpacity={0.75}>
                      <Camera size={16} color={colors.primary} strokeWidth={2.2} />
                      <Text style={styles.secondaryBtnText}>Câmera</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={pickDashboardPhoto} activeOpacity={0.75}>
                      <ImagePlus size={16} color={colors.primary} strokeWidth={2.2} />
                      <Text style={styles.secondaryBtnText}>Galeria</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.fieldLabel}>Observações (opcional)</Text>
                  <TextInput
                    style={[styles.input, styles.inputMultiline]}
                    value={form.observations}
                    onChangeText={(observations) => setForm((f) => ({ ...f, observations }))}
                    placeholder="Alguma observação relevante?"
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
                      <Text style={styles.primaryBtnText}>Enviar solicitação</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </KeyboardAvoidingView>
          {renderPickerOverlay()}
        </View>
      </Modal>

      {/* Detalhes da solicitação */}
      <Modal
        visible={Boolean(detailTarget)}
        animationType="fade"
        transparent
        onRequestClose={() => setDetailTarget(null)}
      >
        <View style={styles.infoOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setDetailTarget(null)}
          />
          <View style={[styles.infoSheet, { backgroundColor: colors.card }]}>
            <View style={styles.infoSheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.infoSheetTitle, { color: colors.text }]}>
                  Solicitação #{detailTarget?.displayNumber ?? ''}
                </Text>
                <Text style={[styles.infoSheetSubtitle, { color: colors.textSecondary }]}>
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
                    <Text style={[styles.releaseValue, { color: statusColor(detailTarget.status, colors) }]}>
                      {STATUS_LABELS[detailTarget.status]}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Data</Text>
                    <Text style={[styles.releaseValue, { color: colors.text }]}>
                      {formatDateLabel(detailTarget.refuelDate)}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Rota</Text>
                    <Text style={[styles.releaseValue, { color: colors.text }]}>
                      {detailTarget.route}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Contrato</Text>
                    <Text style={[styles.releaseValue, { color: colors.text }]}>
                      {fuelContractLabel(detailTarget)}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Condutor</Text>
                    <Text style={[styles.releaseValue, { color: colors.text }]}>
                      {detailTarget.driverName}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Placa</Text>
                    <Text style={[styles.releaseValue, { color: colors.text }]}>
                      {detailTarget.vehiclePlate}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Modelo</Text>
                    <Text style={[styles.releaseValue, { color: colors.text }]}>
                      {detailTarget.vehicleDescription?.trim() || '—'}
                    </Text>
                  </View>
                  <View style={styles.detailField}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Tipo</Text>
                    <Text style={[styles.releaseValue, { color: colors.text }]}>
                      {VEHICLE_TYPE_LABELS[detailTarget.vehicleType] || detailTarget.vehicleType}
                    </Text>
                  </View>
                  {detailTarget.satelliteCityName ? (
                    <View style={styles.detailField}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                        Região administrativa
                      </Text>
                      <Text style={[styles.releaseValue, { color: colors.text }]}>
                        {detailTarget.satelliteCityName}
                      </Text>
                    </View>
                  ) : null}
                  {detailTarget.observations ? (
                    <View style={styles.detailField}>
                      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                        Observações
                      </Text>
                      <Text style={[styles.releaseValue, { color: colors.text }]}>
                        {detailTarget.observations}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {detailTarget.gasStation ? (
                  <View style={[styles.infoBlock, { marginTop: 12 }]}>
                    <View style={styles.releaseRow}>
                      <MapPin size={16} color="#059669" strokeWidth={2.2} />
                      <View style={styles.releaseTextCol}>
                        <Text style={styles.releaseLabel}>Posto liberado</Text>
                        <Text style={[styles.releaseValue, { color: colors.text }]}>
                          {detailTarget.gasStation.name}
                        </Text>
                        {detailTarget.gasStation.address ? (
                          <Text style={[styles.releaseComment, { color: colors.textSecondary }]}>
                            {detailTarget.gasStation.address}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                ) : null}

                {detailTarget.refuelDeadlineAmount && detailTarget.refuelDeadlineUnit ? (
                  <View style={[styles.infoBlock, { marginTop: 10 }]}>
                    <View style={styles.releaseRow}>
                      <Clock size={16} color="#059669" strokeWidth={2.2} />
                      <View style={styles.releaseTextCol}>
                        <Text style={styles.releaseLabel}>Prazo para abastecer</Text>
                        <Text style={[styles.releaseValue, { color: colors.text }]}>
                          {`${detailTarget.refuelDeadlineAmount} ${
                            detailTarget.refuelDeadlineUnit === 'HOURS'
                              ? detailTarget.refuelDeadlineAmount === 1
                                ? 'hora'
                                : 'horas'
                              : detailTarget.refuelDeadlineAmount === 1
                                ? 'dia'
                                : 'dias'
                          }`}
                        </Text>
                        {detailTarget.refuelDeadlineAt ? (
                          <Text style={[styles.releaseComment, { color: colors.textSecondary }]}>
                            {formatDateTimeLabel(detailTarget.refuelDeadlineAt)}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </View>
                ) : null}

                {detailTarget.suppliesApprovalComment ? (
                  <View style={[styles.infoBlock, { marginTop: 10 }]}>
                    <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>
                      Observação do Suprimentos
                    </Text>
                    <Text style={[styles.releaseValue, { color: colors.text, marginTop: 4 }]}>
                      {detailTarget.suppliesApprovalComment}
                    </Text>
                  </View>
                ) : null}
              </ScrollView>
            ) : null}

            {detailTarget && canCancel(detailTarget) ? (
              <TouchableOpacity
                style={[styles.deleteBtn, styles.reportBtnInModal]}
                onPress={() => cancelRequest(detailTarget)}
                activeOpacity={0.85}
                disabled={cancellingId === detailTarget.id}
              >
                {cancellingId === detailTarget.id ? (
                  <ActivityIndicator color="#dc2626" />
                ) : (
                  <>
                    <Trash2 size={15} color="#dc2626" strokeWidth={2.2} />
                    <Text style={styles.deleteBtnText}>Excluir solicitação</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}

            {detailTarget?.status === 'AWAITING_REFUEL' ? (
              <TouchableOpacity
                style={[styles.reportBtn, styles.reportBtnInModal]}
                onPress={() => {
                  const row = detailTarget;
                  setDetailTarget(null);
                  openReportForm(row);
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.reportBtnText}>Informar abastecimento</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Informar abastecimento */}
      <Modal
        visible={Boolean(reportTarget)}
        animationType="slide"
        statusBarTranslucent
        onRequestClose={closeReport}
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
                <Text style={styles.formTitle}>Informar abastecimento</Text>
                <Text style={styles.formSubtitle}>
                  {reportTarget ? `#${reportTarget.displayNumber}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={closeReport}
                style={styles.formCloseBtn}
                hitSlop={6}
                accessibilityLabel="Fechar"
                disabled={reportSubmitting}
              >
                <X size={20} color={colors.text} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            <ScrollView
              contentContainerStyle={styles.formScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {reportTarget &&
              (reportTarget.gasStation || reportTarget.refuelDeadlineAmount) ? (
                <View
                  style={[
                    styles.releaseBox,
                    {
                      backgroundColor: isDark
                        ? 'rgba(5, 150, 105, 0.14)'
                        : 'rgba(5, 150, 105, 0.08)',
                      borderColor: isDark
                        ? 'rgba(5, 150, 105, 0.35)'
                        : 'rgba(5, 150, 105, 0.22)',
                      marginBottom: 16,
                    },
                  ]}
                >
                  {reportTarget.gasStation ? (
                    <View style={styles.releaseRow}>
                      <MapPin size={15} color="#059669" strokeWidth={2.2} />
                      <View style={styles.releaseTextCol}>
                        <Text style={styles.releaseLabel}>Posto liberado</Text>
                        <Text style={styles.releaseValue}>
                          {reportTarget.gasStation.name}
                          {reportTarget.gasStation.address
                            ? ` — ${reportTarget.gasStation.address}`
                            : ''}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                  {reportTarget.refuelDeadlineAmount ? (
                    <View style={styles.releaseRow}>
                      <Clock size={15} color="#059669" strokeWidth={2.2} />
                      <View style={styles.releaseTextCol}>
                        <Text style={styles.releaseLabel}>Prazo para abastecer</Text>
                        <Text style={styles.releaseValue}>
                          {formatRefuelDeadline(
                            reportTarget.refuelDeadlineAmount,
                            reportTarget.refuelDeadlineUnit,
                            reportTarget.refuelDeadlineAt,
                          )}
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              ) : null}

              <Text style={styles.sectionTitle}>Dados do abastecimento</Text>

              <Text style={styles.fieldLabel}>Hodômetro (km) *</Text>
              <TextInput
                style={styles.input}
                value={reportForm.odometerKm}
                onChangeText={(odometerKm) =>
                  setReportForm((f) => ({ ...f, odometerKm: odometerKm.replace(/\D/g, '') }))
                }
                placeholder="Ex.: 45230"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
              />

              <SelectField
                label="Tanque após abastecimento *"
                valueLabel={
                  TANK_LEVEL_OPTIONS.find((o) => o.value === reportForm.tankLevelAfter)?.label ||
                  ''
                }
                placeholder="Selecione o nível"
                colors={colors}
                isDark={isDark}
                onPress={() => {
                  setPickerSearch('');
                  setPicker({
                    title: 'Nível do tanque',
                    options: TANK_LEVEL_OPTIONS.map((o) => ({
                      value: o.value,
                      label: o.label,
                    })),
                    onSelect: (value) => {
                      setReportForm((f) => ({
                        ...f,
                        tankLevelAfter: value as FuelTankLevelAfter,
                      }));
                      setPicker(null);
                    },
                  });
                }}
              />

              <Text style={styles.fieldLabel}>Litros abastecidos *</Text>
              <TextInput
                style={styles.input}
                value={reportForm.litersRefueled}
                onChangeText={(litersRefueled) =>
                  setReportForm((f) => ({ ...f, litersRefueled }))
                }
                placeholder="Ex.: 45,500"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
              />

              <Text style={styles.fieldLabel}>Valor por litro (R$) *</Text>
              <TextInput
                style={styles.input}
                value={reportForm.pricePerLiter}
                onChangeText={(pricePerLiter) =>
                  setReportForm((f) => ({ ...f, pricePerLiter }))
                }
                placeholder="Ex.: 5,89"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
              />

              <Text style={styles.sectionTitle}>Cupom fiscal</Text>
              {reportForm.receiptPhoto ? (
                <View style={styles.photoWrap}>
                  <Image source={{ uri: reportForm.receiptPhoto }} style={styles.photoPreview} />
                  <TouchableOpacity
                    style={styles.photoClear}
                    onPress={() => setReportForm((f) => ({ ...f, receiptPhoto: '' }))}
                    accessibilityLabel="Remover foto"
                  >
                    <X size={16} color="#fff" strokeWidth={2.4} />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.photoEmpty}>
                  <View
                    style={[
                      styles.photoEmptyIcon,
                      { backgroundColor: colors.background },
                    ]}
                  >
                    <Camera size={22} color={colors.textSecondary} />
                  </View>
                  <Text style={styles.photoEmptyTitle}>Adicione a foto do cupom</Text>
                  <Text style={styles.photoEmptyText}>Tire uma foto ou escolha da galeria</Text>
                </View>
              )}
              <View style={styles.photoActions}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={takeReceiptPhoto}
                  activeOpacity={0.75}
                >
                  <Camera size={16} color={colors.primary} strokeWidth={2.2} />
                  <Text style={styles.secondaryBtnText}>Câmera</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={pickReceiptPhoto}
                  activeOpacity={0.75}
                >
                  <ImagePlus size={16} color={colors.primary} strokeWidth={2.2} />
                  <Text style={styles.secondaryBtnText}>Galeria</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Observações (opcional)</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                value={reportForm.observations}
                onChangeText={(observations) =>
                  setReportForm((f) => ({ ...f, observations }))
                }
                placeholder="Alguma observação?"
                placeholderTextColor={colors.textSecondary}
                multiline
              />
            </ScrollView>

            <View
              style={[
                styles.formFooter,
                { borderTopColor: isDark ? colors.border : 'rgba(0,0,0,0.06)' },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  styles.formSubmitBtn,
                  { backgroundColor: '#059669' },
                  reportSubmitting && { opacity: 0.7 },
                ]}
                onPress={submitReportForm}
                disabled={reportSubmitting}
                activeOpacity={0.85}
              >
                {reportSubmitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Confirmar abastecimento</Text>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
          {renderPickerOverlay()}
        </View>
      </Modal>

      {/* Picker genérico (fora de outros modais) */}
      <Modal
        visible={Boolean(picker) && !showForm && !reportTarget}
        animationType="slide"
        transparent
        onRequestClose={() => setPicker(null)}
      >
        <View style={{ flex: 1 }}>{renderPickerOverlay()}</View>
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
    headerTitle: {
      color: colors.headerText,
      fontSize: 18,
      fontWeight: '700',
      flex: 1,
      textAlign: 'center',
    },
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
      marginBottom: 8,
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
    cardMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      fontWeight: '500',
      marginBottom: 4,
    },
    cardVehicle: {
      fontSize: 15,
      marginBottom: 4,
    },
    cardPlate: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: 0.3,
    },
    cardModel: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    cardSub: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    cardHint: {
      fontSize: 11,
      fontWeight: '600',
      marginTop: 10,
      letterSpacing: -0.1,
    },
    releaseBox: {
      marginTop: 12,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 10,
    },
    releaseRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    releaseTextCol: { flex: 1, gap: 2 },
    releaseLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: '#059669',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    releaseValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 20,
    },
    releaseComment: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      lineHeight: 18,
      marginTop: 2,
    },
    infoOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
      padding: 16,
      paddingBottom: 28,
    },
    infoSheet: {
      borderRadius: 20,
      padding: 18,
      gap: 12,
      maxHeight: '88%',
    },
    infoSheetHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 4,
    },
    infoSheetTitle: {
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    infoSheetSubtitle: {
      fontSize: 13,
      fontWeight: '500',
      marginTop: 2,
    },
    infoBlock: {
      borderRadius: 14,
      padding: 12,
      backgroundColor: isDark ? 'rgba(5, 150, 105, 0.12)' : 'rgba(5, 150, 105, 0.08)',
    },
    detailGrid: {
      gap: 12,
    },
    detailField: {
      gap: 2,
    },
    detailLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    reportBtn: {
      backgroundColor: '#059669',
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    reportBtnInModal: {
      alignSelf: 'stretch',
      marginTop: 8,
      minHeight: 48,
    },
    reportBtnText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    deleteBtn: {
      backgroundColor: isDark ? 'rgba(220,38,38,0.15)' : 'rgba(220,38,38,0.08)',
      borderRadius: 12,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    deleteBtnText: {
      color: '#dc2626',
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: -0.2,
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
    hintChip: {
      alignSelf: 'flex-start',
      backgroundColor: isDark ? 'rgba(206,55,54,0.18)' : 'rgba(206,55,54,0.08)',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      marginBottom: 14,
      marginTop: -4,
    },
    hintChipText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    photoWrap: {
      position: 'relative',
      marginBottom: 10,
      borderRadius: 18,
      overflow: 'hidden',
    },
    photoPreview: {
      width: '100%',
      height: 200,
      borderRadius: 18,
      backgroundColor: colors.border,
    },
    photoClear: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    photoEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 28,
      paddingHorizontal: 20,
      borderRadius: 18,
      backgroundColor: isDark ? colors.card : colors.surface,
      marginBottom: 10,
      gap: 6,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    photoEmptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    photoEmptyTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.2,
    },
    photoEmptyText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      textAlign: 'center',
    },
    photoActions: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    secondaryBtn: {
      flex: 1,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
      paddingVertical: 13,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    secondaryBtnText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
    pickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    pickerOverlayAbsolute: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 100,
      elevation: 100,
    },
    pickerSheet: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 8,
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
