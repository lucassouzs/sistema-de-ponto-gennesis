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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import {
  ArrowLeft,
  Fuel,
  Plus,
  Search,
  Camera,
  X,
  Clock,
  CheckCircle,
  XCircle,
  ChevronDown,
  Moon,
  Sun,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { onFabBarPress } from '../navigation/fabBarEvents';

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
          style={{
            flex: 1,
            fontSize: 15,
            color: valueLabel ? colors.text : colors.textSecondary,
          }}
          numberOfLines={1}
        >
          {valueLabel || placeholder}
        </Text>
        <ChevronDown size={18} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

export default function FuelRequestsScreen() {
  const navigation = useNavigation();
  const navState = navigation.getState?.();
  const isTabScreen = navState?.type === 'tab';
  const { colors, isDark, toggleTheme } = useTheme();
  const { user } = useAuth();
  const styles = getStyles(colors);

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
      <SafeAreaView edges={['top']} style={styles.topSafe}>
        <View style={styles.header}>
          {isTabScreen ? (
            <View style={styles.headerSide}>
              <Image
                source={require('../../assets/logobranca.png')}
                style={styles.headerLogo}
                resizeMode="contain"
              />
            </View>
          ) : (
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
              <ArrowLeft size={24} color={colors.headerText} />
            </TouchableOpacity>
          )}
          <Text style={styles.headerTitle}>Combustível</Text>
          <TouchableOpacity onPress={toggleTheme} style={styles.iconBtn}>
            {isDark ? (
              <Sun size={22} color={colors.headerText} strokeWidth={2} />
            ) : (
              <Moon size={22} color={colors.headerText} strokeWidth={2} />
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>

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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {filterChips.map(({ key, label, count, Icon }) => {
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
            placeholder="Buscar placa, rota, status..."
            placeholderTextColor={colors.textSecondary}
            value={searchTerm}
            onChangeText={setSearchTerm}
          />
        </View>

        <TouchableOpacity style={styles.primaryBtn} onPress={openForm}>
          <Plus size={18} color="#fff" />
          <Text style={styles.primaryBtnText}>Nova solicitação</Text>
        </TouchableOpacity>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
        ) : filteredRows.length === 0 ? (
          <View style={styles.empty}>
            <Fuel size={40} color={colors.textSecondary} />
            <Text style={styles.emptyTitle}>Nenhuma solicitação</Text>
            <Text style={styles.emptyText}>
              Toque em Nova solicitação para pedir abastecimento.
            </Text>
          </View>
        ) : (
          filteredRows.map((row) => (
            <View key={row.id} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.cardNumber}>#{row.displayNumber}</Text>
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: `${statusColor(row.status, colors)}22` },
                  ]}
                >
                  <Text style={[styles.badgeText, { color: statusColor(row.status, colors) }]}>
                    {STATUS_LABELS[row.status]}
                  </Text>
                </View>
              </View>
              <Text style={styles.cardRoute}>{row.route}</Text>
              <Text style={styles.cardMeta}>
                {formatDateLabel(row.refuelDate)} · {row.vehiclePlate} · {row.driverName}
              </Text>
              {row.satelliteCityName ? (
                <Text style={styles.cardMeta}>Cidade: {row.satelliteCityName}</Text>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      {/* Formulário */}
      <Modal visible={showForm} animationType="slide" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
          <View style={[styles.header, { backgroundColor: colors.headerBackground }]}>
            <TouchableOpacity onPress={() => setShowForm(false)} style={styles.iconBtn}>
              <X size={24} color={colors.headerText} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Nova solicitação</Text>
            <View style={{ width: 40 }} />
          </View>

          {loadingOptions ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
          ) : (
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
              <Text style={styles.fieldLabel}>Data do abastecimento</Text>
              <TextInput
                style={styles.input}
                value={form.refuelDate}
                onChangeText={(refuelDate) => setForm((f) => ({ ...f, refuelDate }))}
                placeholder="AAAA-MM-DD"
                placeholderTextColor={colors.textSecondary}
              />

              <Text style={styles.fieldLabel}>Rota</Text>
              <TextInput
                style={styles.input}
                value={form.route}
                onChangeText={(route) => setForm((f) => ({ ...f, route }))}
                placeholder="Ex.: Obra X → Posto"
                placeholderTextColor={colors.textSecondary}
              />

              <SelectField
                label="Estado"
                valueLabel={form.stateCode}
                placeholder="Selecione o estado"
                colors={colors}
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

              <SelectField
                label="Condutor"
                valueLabel={form.driverNamePreview}
                placeholder="Selecione o condutor"
                colors={colors}
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
                <Text style={styles.hint}>
                  Tipo: {form.vehicleType === 'PRIVATE' ? 'Particular' : 'Frota / empresa'}
                  {form.vehicleDescription ? ` · ${form.vehicleDescription}` : ''}
                </Text>
              ) : null}

              <Text style={styles.fieldLabel}>Foto do painel</Text>
              {form.dashboardPhoto ? (
                <Image source={{ uri: form.dashboardPhoto }} style={styles.photoPreview} />
              ) : null}
              <View style={styles.photoActions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={takeDashboardPhoto}>
                  <Camera size={16} color={colors.primary} />
                  <Text style={styles.secondaryBtnText}>Câmera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryBtn} onPress={pickDashboardPhoto}>
                  <Text style={styles.secondaryBtnText}>Galeria</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.fieldLabel}>Observações (opcional)</Text>
              <TextInput
                style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={form.observations}
                onChangeText={(observations) => setForm((f) => ({ ...f, observations }))}
                placeholder="Observações"
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
                  <Text style={styles.primaryBtnText}>Enviar solicitação</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
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
          <View style={[styles.pickerSheet, { backgroundColor: colors.card }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>
                {picker?.title}
              </Text>
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
                  {item.subtitle ? (
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                      {item.subtitle}
                    </Text>
                  ) : null}
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
    topSafe: { backgroundColor: colors.headerBackground },
    header: {
      backgroundColor: colors.headerBackground,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
    },
    headerTitle: {
      color: colors.headerText,
      fontSize: 18,
      fontWeight: '700',
      flex: 1,
      textAlign: 'center',
    },
    headerSide: {
      width: 72,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    headerLogo: {
      width: 72,
      height: 28,
    },
    iconBtn: { padding: 8, width: 40, alignItems: 'center' },
    container: { flex: 1 },
    scrollContent: { padding: 16, paddingBottom: 40 },
    chipsRow: { gap: 8, paddingBottom: 12 },
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
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
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
    hint: { fontSize: 12, color: colors.textSecondary, marginBottom: 12, marginTop: -6 },
    photoPreview: {
      width: '100%',
      height: 180,
      borderRadius: 12,
      marginBottom: 10,
      backgroundColor: colors.border,
    },
    photoActions: { flexDirection: 'row', gap: 10, marginBottom: 14 },
    secondaryBtn: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
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
