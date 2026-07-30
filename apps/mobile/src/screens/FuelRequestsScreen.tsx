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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

type CardFilter = 'all' | 'pending' | 'concluded' | 'cancelled';

type FuelRequestRow = {
  id: string;
  displayNumber: number;
  refuelDate: string;
  route: string;
  driverName: string;
  vehiclePlate: string;
  vehicleType: FuelVehicleType;
  status: FuelRefuelStatus;
  satelliteCityName?: string | null;
  observations?: string | null;
};

type SatelliteCity = { code: string; stateCode: string; name: string };
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
  AWAITING_REFUEL: 'Aguardando abastecimento',
  COMPLETED: 'Concluída',
  APPROVED: 'Aguardando Suprimentos',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

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

function isPendingStatus(status: FuelRefuelStatus) {
  return (
    status === 'PENDING_MANAGER' ||
    status === 'PENDING_SUPPLIES' ||
    status === 'AWAITING_REFUEL' ||
    status === 'APPROVED'
  );
}

function isCancelledStatus(status: FuelRefuelStatus) {
  return status === 'CANCELLED' || status === 'REJECTED';
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
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

export default function FuelRequestsScreen() {
  const navigation = useNavigation();
  const navState = navigation.getState?.();
  const isTabScreen = navState?.type === 'tab';
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const styles = getStyles(colors, isDark);

  const [rows, setRows] = useState<FuelRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cardFilter, setCardFilter] = useState<CardFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM());

  const [states, setStates] = useState<string[]>([]);
  const [cities, setCities] = useState<SatelliteCity[]>([]);
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
      const [citiesRes, driversRes, vehiclesRes] = await Promise.all([
        api.get('/api/fuel-refuel-requests/satellite-cities'),
        api.get('/api/fuel-refuel-requests/driver-options'),
        api.get('/api/vehicles?isActive=true&limit=100&page=1'),
      ]);
      const citiesJson = await citiesRes.json();
      const driversJson = await driversRes.json();
      const vehiclesJson = await vehiclesRes.json();

      if (citiesRes.ok) {
        setStates(citiesJson?.data?.states || []);
        setCities(citiesJson?.data?.cities || []);
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
    const concluded = rows.filter((r) => r.status === 'COMPLETED').length;
    const cancelled = rows.filter((r) => isCancelledStatus(r.status)).length;
    return { total: rows.length, pending, concluded, cancelled };
  }, [rows]);

  const filteredRows = useMemo(() => {
    let list = rows;
    if (cardFilter === 'pending') list = list.filter((r) => isPendingStatus(r.status));
    if (cardFilter === 'concluded') list = list.filter((r) => r.status === 'COMPLETED');
    if (cardFilter === 'cancelled') list = list.filter((r) => isCancelledStatus(r.status));
    const q = searchTerm.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        [
          String(r.displayNumber),
          r.route,
          r.driverName,
          r.vehiclePlate,
          STATUS_LABELS[r.status],
          r.satelliteCityName || '',
        ]
          .join(' ')
          .toLowerCase()
          .includes(q),
      );
    }
    return list;
  }, [rows, cardFilter, searchTerm]);

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
    { key: 'concluded', label: 'Concluídas', count: counts.concluded, Icon: CheckCircle },
    { key: 'cancelled', label: 'Canceladas', count: counts.cancelled, Icon: XCircle },
  ];

  return (
    <View style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader
        showBack={!isTabScreen}
        onBack={() => navigation.goBack()}
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
        <Text style={styles.pageTitle}>Combustível</Text>
        <Text style={styles.pageSubtitle}>
          {counts.total} {counts.total === 1 ? 'solicitação' : 'solicitações'}
        </Text>

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

        <View style={styles.searchBox}>
          <Search size={16} color={colors.textSecondary} strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar placa, rota, status..."
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
                <View style={styles.cardFooter}>
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {formatDateLabel(row.refuelDate)}
                  </Text>
                  <View style={styles.dot} />
                  <Text style={styles.cardMeta} numberOfLines={1}>
                    {row.vehiclePlate}
                  </Text>
                </View>
                <Text style={styles.cardSub} numberOfLines={1}>
                  {[row.driverName, row.satelliteCityName].filter(Boolean).join(' · ')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Formulário */}
      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
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
                    placeholder="Ex.: Obra X → Posto"
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
                    label="Cidade de abastecimento"
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
                          subtitle: c.stateCode,
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
                          subtitle: [v.marcaVeic, v.modeloVeic, v.frotaPartic]
                            .filter(Boolean)
                            .join(' · '),
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
                        {form.vehicleType === 'PRIVATE' ? 'Particular' : 'Frota / empresa'}
                        {form.vehicleDescription ? ` · ${form.vehicleDescription}` : ''}
                      </Text>
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
                      <View style={[styles.photoEmptyIcon, { backgroundColor: isDark ? colors.card : '#EEF0F3' }]}>
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
        </SafeAreaView>
      </Modal>

      {/* Picker genérico */}
      <Modal
        visible={!!picker}
        animationType="slide"
        transparent
        onRequestClose={() => setPicker(null)}
      >
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
      backgroundColor: isDark ? colors.card : '#EEF0F3',
    },
    chipActive: {
      backgroundColor: colors.primary,
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
      backgroundColor: isDark ? colors.card : '#EEF0F3',
      marginBottom: 10,
      gap: 6,
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
      backgroundColor: isDark ? colors.card : '#EEF0F3',
      borderRadius: 14,
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
