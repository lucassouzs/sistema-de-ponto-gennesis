import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
  Animated,
  LayoutChangeEvent,
  Linking,
  Image,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import {
  Plus,
  Check,
  Star,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  ListTodo,
  X,
  Users,
  Phone,
  BarChart3,
  CheckCircle2,
  Plane,
  Coffee,
  MapPin,
  Briefcase,
  FileText,
  Upload,
  Download,
  Wrench,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import AppHeader from '../components/AppHeader';
import UserAvatar from '../components/UserAvatar';
import { PersonPickerListRow } from '../components/PersonPickerUi';
import { formatCpfDisplay } from '../lib/cpf';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  createPlannerEvent,
  deletePlannerEvent,
  deletePlannerEventAta,
  EVENT_COLORS,
  fetchKanbanPickerUsers,
  fetchPlannerEvents,
  updatePlannerEvent,
  uploadPlannerEventAta,
  type KanbanPickerUser,
  type PlannerEvent,
  type PlannerEventAttendee,
} from '../services/plannerEvents';
import { fetchGestaoOsAgenda } from '../services/gestaoOs';
import {
  createPlannerTask,
  createPlannerTaskList,
  deletePlannerTask,
  fetchPlannerTaskLists,
  updatePlannerTask,
  type PlannerTask,
  type PlannerTaskList,
} from '../services/plannerTasks';
import { resolveMediaUrl } from '../utils/resolveMediaUrl';
import type { RootStackParamList } from '../../App';
import MapView, { Marker } from 'react-native-maps';

type Mode = 'agenda' | 'tasks';

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function pad2(n: number) {
  return String(n).padStart(2, '0');
}
function toLocalIso(date: Date, time = '09:00') {
  const [hh, mm] = time.split(':').map(Number);
  const d = new Date(date);
  d.setHours(hh || 9, mm || 0, 0, 0);
  return d.toISOString();
}
function formatMonthTitle(d: Date) {
  const s = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const PLANNER_ICON_OPTIONS: Array<{
  id: string;
  label: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}> = [
  { id: 'meeting', label: 'Reunião', Icon: Users },
  { id: 'phone', label: 'Ligação', Icon: Phone },
  { id: 'chart', label: 'Vendas', Icon: BarChart3 },
  { id: 'star', label: 'Destaque', Icon: Star },
  { id: 'check', label: 'Tarefa', Icon: CheckCircle2 },
  { id: 'plane', label: 'Viagem', Icon: Plane },
  { id: 'coffee', label: 'Café', Icon: Coffee },
  { id: 'users', label: 'Equipe', Icon: Users },
  { id: 'map-pin', label: 'Local', Icon: MapPin },
  { id: 'briefcase', label: 'Trabalho', Icon: Briefcase },
  { id: 'wrench', label: 'Manutenção', Icon: Wrench },
];

const PLANNER_ICON_MAP: Record<
  string,
  React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
> = Object.fromEntries(PLANNER_ICON_OPTIONS.map((o) => [o.id, o.Icon]));

function PlannerEventIcon({
  icon,
  color,
}: {
  icon?: string | null;
  color: string;
}) {
  if (!icon) return null;
  const Icon = PLANNER_ICON_MAP[icon];
  if (!Icon) return null;
  return <Icon size={14} color={color} strokeWidth={2.2} />;
}

function AnimatedModeSwitcher({
  mode,
  onChange,
  colors,
  styles,
}: {
  mode: Mode;
  onChange: (next: Mode) => void;
  colors: any;
  styles: ReturnType<typeof getStyles>;
}) {
  const pillX = useRef(new Animated.Value(0)).current;
  const [halfWidth, setHalfWidth] = useState(0);
  const PAD = 4;

  const onTrackLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    const next = Math.max(0, (w - PAD * 2) / 2);
    setHalfWidth(next);
    pillX.setValue(mode === 'agenda' ? 0 : next);
  };

  useEffect(() => {
    if (halfWidth <= 0) return;
    Animated.timing(pillX, {
      toValue: mode === 'agenda' ? 0 : halfWidth,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [mode, halfWidth, pillX]);

  return (
    <View style={styles.switcher} onLayout={onTrackLayout}>
      {halfWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.switchPill,
            {
              width: halfWidth,
              transform: [{ translateX: pillX }],
              backgroundColor: colors.surface,
            },
          ]}
        />
      )}
      <TouchableOpacity
        style={styles.switchBtn}
        onPress={() => onChange('agenda')}
        activeOpacity={0.8}
      >
        <CalendarIcon
          size={15}
          color={mode === 'agenda' ? colors.primary : colors.textSecondary}
          strokeWidth={2.2}
        />
        <Text style={[styles.switchText, mode === 'agenda' && styles.switchTextActive]}>
          Agenda
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.switchBtn}
        onPress={() => onChange('tasks')}
        activeOpacity={0.8}
      >
        <ListTodo
          size={15}
          color={mode === 'tasks' ? colors.primary : colors.textSecondary}
          strokeWidth={2.2}
        />
        <Text style={[styles.switchText, mode === 'tasks' && styles.switchTextActive]}>
          Tarefas
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function AgendaDayMap({
  events,
  colors,
}: {
  events: PlannerEvent[];
  colors: { textSecondary: string; border: string };
}) {
  const pins = events.filter(
    (ev) => ev.latitude != null && ev.longitude != null && Number.isFinite(Number(ev.latitude))
  );
  if (pins.length === 0) return null;
  const latitudes = pins.map((ev) => Number(ev.latitude));
  const longitudes = pins.map((ev) => Number(ev.longitude));
  const latitude = latitudes.reduce((sum, n) => sum + n, 0) / latitudes.length;
  const longitude = longitudes.reduce((sum, n) => sum + n, 0) / longitudes.length;
  const latSpan = Math.max(0.02, Math.max(...latitudes) - Math.min(...latitudes) + 0.01);
  const lngSpan = Math.max(0.02, Math.max(...longitudes) - Math.min(...longitudes) + 0.01);
  const osm = `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=14&size=640x280&maptype=mapnik&markers=${latitudes[0]},${longitudes[0]},red-pushpin`;

  const openMaps = () => {
    const q = `${latitude},${longitude}`;
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };

  return (
    <View style={{ marginBottom: 12 }}>
      {Platform.OS === 'web' ? (
        <TouchableOpacity onPress={openMaps} activeOpacity={0.9}>
          <Image source={{ uri: osm }} style={{ width: '100%', height: 180, borderRadius: 14 }} />
        </TouchableOpacity>
      ) : (
        <MapView
          style={{
            width: '100%',
            height: 180,
            borderRadius: 14,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            overflow: 'hidden',
          }}
          initialRegion={{
            latitude,
            longitude,
            latitudeDelta: latSpan,
            longitudeDelta: lngSpan,
          }}
          scrollEnabled={false}
          zoomEnabled
          onPress={openMaps}
        >
          {pins.map((ev) => (
            <Marker
              key={ev.id}
              coordinate={{
                latitude: Number(ev.latitude),
                longitude: Number(ev.longitude),
              }}
              title={ev.title}
              description={ev.address || undefined}
            />
          ))}
        </MapView>
      )}
      <Text style={{ marginTop: 6, fontSize: 12, color: colors.textSecondary }}>
        Mapa das OS do dia · toque para abrir o Google Maps
      </Text>
    </View>
  );
}

export default function AgendaScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const { user: meUser } = useAuth();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const initialMode =
    (route.params as { mode?: Mode } | undefined)?.mode === 'tasks' ? 'tasks' : 'agenda';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [eventModal, setEventModal] = useState<null | {
    mode: 'create' | 'edit';
    event?: PlannerEvent;
  }>(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventStart, setEventStart] = useState('09:00');
  const [eventEnd, setEventEnd] = useState('10:00');
  const [eventColor, setEventColor] = useState(EVENT_COLORS[0]);
  const [eventIcon, setEventIcon] = useState<string | null>(null);
  const [eventAttendees, setEventAttendees] = useState<PlannerEventAttendee[]>([]);
  const [eventAtaName, setEventAtaName] = useState<string | null>(null);
  const [eventAtaUrl, setEventAtaUrl] = useState<string | null>(null);
  const [pendingAta, setPendingAta] = useState<{
    uri: string;
    name: string;
    type: string;
  } | null>(null);
  const [removeAtaOnSave, setRemoveAtaOnSave] = useState(false);
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newListTitle, setNewListTitle] = useState('');
  const [listModalOpen, setListModalOpen] = useState(false);

  const rangeFrom = startOfMonth(cursor);
  const rangeTo = endOfMonth(cursor);

  const eventsQuery = useQuery({
    queryKey: ['planner-events', rangeFrom.toISOString(), rangeTo.toISOString()],
    queryFn: () => fetchPlannerEvents(rangeFrom, rangeTo),
    enabled: mode === 'agenda',
  });

  const gestaoOsQuery = useQuery({
    queryKey: ['gestao-os-agenda', rangeFrom.toISOString(), rangeTo.toISOString()],
    queryFn: () => fetchGestaoOsAgenda(rangeFrom, rangeTo),
    enabled: mode === 'agenda',
  });

  const listsQuery = useQuery({
    queryKey: ['planner-task-lists'],
    queryFn: fetchPlannerTaskLists,
    enabled: mode === 'tasks',
  });

  const pickerUsersQuery = useQuery({
    queryKey: ['kanban-member-picker-users'],
    queryFn: fetchKanbanPickerUsers,
    enabled: memberPickerOpen,
    staleTime: 60_000,
  });

  const plannerEvents = eventsQuery.data?.events ?? [];
  const canWrite = eventsQuery.data?.meta?.canWrite !== false;
  const events = useMemo<PlannerEvent[]>(() => {
    const linked: PlannerEvent[] = (gestaoOsQuery.data || []).map((item) => ({
      id: item.id,
      userId: meUser?.id || '',
      title: item.title,
      description: item.description || '',
      startAt: item.startAt,
      endAt: item.endAt,
      color: item.color,
      icon: item.kind === 'plan' ? 'check' : 'wrench',
      href: item.href,
      source: item.kind === 'plan' ? 'gestao-os-plan' : 'gestao-os',
      workOrderId: item.workOrderId,
      planId: item.planId,
      latitude: item.latitude,
      longitude: item.longitude,
      address: item.address,
    }));
    return [...plannerEvents, ...linked];
  }, [plannerEvents, gestaoOsQuery.data, meUser?.id]);
  const lists = listsQuery.data ?? [];
  const activeList: PlannerTaskList | undefined =
    lists.find((l) => l.id === activeListId) || lists[0];

  const filteredPickerUsers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const exclude = new Set(eventAttendees.map((a) => a.id));
    return (pickerUsersQuery.data || []).filter((u) => {
      if (exclude.has(u.id)) return false;
      if (meUser?.id && u.id === meUser.id) return false;
      if (!q) return true;
      const cpf = formatCpfDisplay(u.cpf).toLowerCase();
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        cpf.includes(q)
      );
    });
  }, [pickerUsersQuery.data, memberSearch, eventAttendees, meUser?.id]);

  useEffect(() => {
    if (!activeListId && lists[0]?.id) setActiveListId(lists[0].id);
  }, [lists, activeListId]);

  const daysGrid = useMemo(() => {
    const first = startOfMonth(cursor);
    const startPad = (first.getDay() + 6) % 7; // Monday-first
    const daysInMonth = endOfMonth(cursor).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  }, [cursor]);

  useEffect(() => {
    // Mantém o dia selecionado dentro do mês visível.
    if (
      selectedDay.getFullYear() !== cursor.getFullYear() ||
      selectedDay.getMonth() !== cursor.getMonth()
    ) {
      const today = startOfDay(new Date());
      if (today.getFullYear() === cursor.getFullYear() && today.getMonth() === cursor.getMonth()) {
        setSelectedDay(today);
      } else {
        setSelectedDay(startOfDay(new Date(cursor.getFullYear(), cursor.getMonth(), 1)));
      }
    }
  }, [cursor]); // eslint-disable-line react-hooks/exhaustive-deps

  const eventsByDay = useMemo(() => {
    const map = new Map<string, PlannerEvent[]>();
    for (const ev of events) {
      const d = new Date(ev.startAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) || [];
      arr.push(ev);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const dayEvents = useMemo(() => {
    const key = `${selectedDay.getFullYear()}-${selectedDay.getMonth()}-${selectedDay.getDate()}`;
    return (eventsByDay.get(key) || []).slice().sort((a, b) => a.startAt.localeCompare(b.startAt));
  }, [eventsByDay, selectedDay]);

  const openCreateEvent = () => {
    setEventTitle('');
    setEventDesc('');
    setEventStart('09:00');
    setEventEnd('10:00');
    setEventColor(EVENT_COLORS[0]);
    setEventIcon(null);
    setEventAttendees([]);
    setEventAtaName(null);
    setEventAtaUrl(null);
    setPendingAta(null);
    setRemoveAtaOnSave(false);
    setMemberPickerOpen(false);
    setMemberSearch('');
    setEventModal({ mode: 'create' });
  };

  const openEditEvent = (ev: PlannerEvent) => {
    if (ev.workOrderId) {
      navigation.navigate('GestaoOsDetail', { id: ev.workOrderId });
      return;
    }
    if (ev.planId || ev.source === 'gestao-os-plan') {
      Alert.alert(
        'Plano de manutenção',
        'Este compromisso vem de um plano. Abra Planos no sistema web para editar ou gerar a OS.'
      );
      return;
    }
    setEventTitle(ev.title);
    setEventDesc(ev.description || '');
    setEventStart(formatTime(ev.startAt) || '09:00');
    setEventEnd(formatTime(ev.endAt) || '10:00');
    setEventColor(ev.color || EVENT_COLORS[0]);
    setEventIcon(ev.icon || null);
    setEventAttendees(ev.attendees || []);
    setEventAtaName(ev.ataFileName || null);
    setEventAtaUrl(ev.ataFileUrl || null);
    setPendingAta(null);
    setRemoveAtaOnSave(false);
    setMemberPickerOpen(false);
    setMemberSearch('');
    setEventModal({ mode: 'edit', event: ev });
  };

  const pickAtaPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPendingAta({
        uri: asset.uri,
        name: asset.name || 'ata.pdf',
        type: asset.mimeType || 'application/pdf',
      });
      setRemoveAtaOnSave(false);
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao selecionar PDF' });
    }
  };

  const saveEvent = async () => {
    const title = eventTitle.trim();
    if (!title) {
      Toast.show({ type: 'error', text1: 'Informe o título' });
      return;
    }
    setSaving(true);
    try {
      const startAt = toLocalIso(selectedDay, eventStart);
      const endAt = toLocalIso(selectedDay, eventEnd);
      const payload = {
        title,
        description: eventDesc.trim(),
        startAt,
        endAt,
        color: eventColor,
        icon: eventIcon,
        attendeeIds: eventAttendees.map((a) => a.id),
      };

      let saved: PlannerEvent;
      if (eventModal?.mode === 'edit' && eventModal.event) {
        saved = await updatePlannerEvent(eventModal.event.id, payload);
        Toast.show({ type: 'success', text1: 'Evento atualizado' });
      } else {
        saved = await createPlannerEvent(payload);
        Toast.show({ type: 'success', text1: 'Evento criado' });
      }

      if (removeAtaOnSave && saved.id) {
        saved = await deletePlannerEventAta(saved.id);
      } else if (pendingAta && saved.id) {
        saved = await uploadPlannerEventAta(saved.id, pendingAta);
      }

      setEventModal(null);
      setPendingAta(null);
      await queryClient.invalidateQueries({ queryKey: ['planner-events'] });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Erro', text2: e?.message || 'Falha ao salvar' });
    } finally {
      setSaving(false);
    }
  };

  const assignToMe = () => {
    if (!meUser?.id) return;
    if (eventAttendees.some((a) => a.id === meUser.id)) return;
    setEventAttendees((prev) => [
      ...prev,
      {
        id: meUser.id,
        name: meUser.name,
        email: meUser.email || '',
        profilePhotoUrl: meUser.profilePhotoUrl ?? null,
      },
    ]);
  };

  const addAttendee = (user: KanbanPickerUser) => {
    setEventAttendees((prev) => {
      if (prev.some((a) => a.id === user.id)) return prev;
      return [
        ...prev,
        {
          id: user.id,
          name: user.name,
          email: user.email,
          profilePhotoUrl: user.profilePhotoUrl ?? null,
        },
      ];
    });
    setMemberPickerOpen(false);
    setMemberSearch('');
  };

  const confirmDeleteEvent = (ev: PlannerEvent) => {
    Alert.alert('Excluir evento', `Excluir "${ev.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePlannerEvent(ev.id);
            Toast.show({ type: 'success', text1: 'Evento excluído' });
            setEventModal(null);
            await queryClient.invalidateQueries({ queryKey: ['planner-events'] });
          } catch (e: any) {
            Toast.show({ type: 'error', text1: e?.message || 'Falha ao excluir' });
          }
        },
      },
    ]);
  };

  const toggleTask = async (task: PlannerTask) => {
    try {
      await updatePlannerTask(task.id, { completed: !task.completed });
      await queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao atualizar' });
    }
  };

  const toggleStar = async (task: PlannerTask) => {
    try {
      await updatePlannerTask(task.id, { starred: !task.starred });
      await queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao atualizar' });
    }
  };

  const addTask = async () => {
    const title = newTaskTitle.trim();
    if (!title || !activeList) return;
    try {
      await createPlannerTask({ title, listId: activeList.id });
      setNewTaskTitle('');
      await queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao criar' });
    }
  };

  const removeTask = (task: PlannerTask) => {
    Alert.alert('Excluir tarefa', `Excluir "${task.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePlannerTask(task.id);
            await queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
          } catch (e: any) {
            Toast.show({ type: 'error', text1: e?.message || 'Falha ao excluir' });
          }
        },
      },
    ]);
  };

  const createList = async () => {
    const title = newListTitle.trim();
    if (!title) return;
    try {
      const list = await createPlannerTaskList(title);
      setNewListTitle('');
      setListModalOpen(false);
      setActiveListId(list.id);
      await queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
      Toast.show({ type: 'success', text1: 'Lista criada' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao criar lista' });
    }
  };

  const onRefresh = useCallback(() => {
    if (mode === 'agenda') {
      void eventsQuery.refetch();
      void gestaoOsQuery.refetch();
    } else void listsQuery.refetch();
  }, [mode, eventsQuery, listsQuery, gestaoOsQuery]);

  const openTasks = activeList?.tasks.filter((t) => !t.completed) ?? [];
  const doneTasks = activeList?.tasks.filter((t) => t.completed) ?? [];

  const goToday = () => {
    const today = startOfDay(new Date());
    setCursor(startOfMonth(today));
    setSelectedDay(today);
  };

  return (
    <View style={styles.safe}>
      <AppHeader
        showBack
        title={mode === 'agenda' ? 'Agenda' : 'Tarefas'}
        onBack={() => navigation.goBack()}
      />

      <AnimatedModeSwitcher
        mode={mode}
        onChange={setMode}
        colors={colors}
        styles={styles}
      />

      {mode === 'agenda' ? (
        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyPad}
          refreshControl={
            <RefreshControl
              refreshing={eventsQuery.isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <View style={styles.monthNavCard}>
            <View style={styles.monthNavGroup}>
              <TouchableOpacity
                style={styles.monthNavBtn}
                onPress={() =>
                  setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
                }
                hitSlop={8}
                accessibilityLabel="Mês anterior"
              >
                <ChevronLeft size={20} color={colors.textSecondary} />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>{formatMonthTitle(cursor)}</Text>
              <TouchableOpacity
                style={styles.monthNavBtn}
                onPress={() =>
                  setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
                }
                hitSlop={8}
                accessibilityLabel="Próximo mês"
              >
                <ChevronRight size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.todayBtn} onPress={goToday} activeOpacity={0.75}>
              <Text style={styles.todayBtnText}>Hoje</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.calendarCard}>
            <View style={styles.weekRow}>
              {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
                <Text key={d} style={styles.weekLabel}>
                  {d}
                </Text>
              ))}
            </View>

            <View style={styles.grid}>
              {daysGrid.map((week, weekIdx) => (
                <View key={`w-${weekIdx}`} style={styles.weekLine}>
                  {week.map((day, dayIdx) => {
                    if (!day) {
                      return <View key={`e-${weekIdx}-${dayIdx}`} style={styles.dayCell} />;
                    }
                    const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
                    const has = (eventsByDay.get(key) || []).length > 0;
                    const selected = sameDay(day, selectedDay);
                    const today = sameDay(day, new Date());
                    return (
                      <TouchableOpacity
                        key={key}
                        style={styles.dayCell}
                        onPress={() => setSelectedDay(startOfDay(day))}
                        activeOpacity={0.7}
                      >
                        <View
                          collapsable={false}
                          style={[
                            styles.dayCircle,
                            today
                              ? styles.dayToday
                              : selected
                                ? styles.daySelected
                                : styles.dayIdle,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayNum,
                              today && styles.dayNumToday,
                              selected && !today && styles.dayNumSelected,
                            ]}
                          >
                            {day.getDate()}
                          </Text>
                        </View>
                        {has ? (
                          <View
                            style={[
                              styles.dot,
                              today && styles.dotOnToday,
                              selected && !today && styles.dotSelected,
                            ]}
                          />
                        ) : (
                          <View style={styles.dotPlaceholder} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
          </View>

          <View style={styles.dayHeader}>
            <Text style={styles.dayHeaderTitle}>
              {selectedDay.toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
            {canWrite ? (
              <TouchableOpacity style={styles.addChip} onPress={openCreateEvent} activeOpacity={0.75}>
                <Plus size={15} color={colors.primary} strokeWidth={2.4} />
                <Text style={styles.addChipText}>Evento</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {dayEvents.length > 0 ? <AgendaDayMap events={dayEvents} colors={colors} /> : null}

          {eventsQuery.isLoading || gestaoOsQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : dayEvents.length === 0 ? (
            <Text style={styles.empty}>Nenhum evento neste dia.</Text>
          ) : (
            <View style={styles.eventList}>
              {dayEvents.map((ev) => {
                const attendees = ev.attendees || [];
                const accent = ev.color || colors.primary;
                const startLabel = formatTime(ev.startAt);
                const endLabel = formatTime(ev.endAt);
                const startMs = new Date(ev.startAt).getTime();
                const endMs = new Date(ev.endAt).getTime();
                const nowMs = Date.now();
                const ongoing =
                  !Number.isNaN(startMs) &&
                  !Number.isNaN(endMs) &&
                  startMs <= nowMs &&
                  endMs >= nowMs;

                return (
                  <TouchableOpacity
                    key={ev.id}
                    style={styles.eventCard}
                    onPress={() => {
                      if (ev.workOrderId || ev.planId || ev.href) {
                        openEditEvent(ev);
                        return;
                      }
                      if (canWrite) openEditEvent(ev);
                    }}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.eventTimeChip, { backgroundColor: `${accent}18` }]}>
                      <Text style={[styles.eventTimeChipText, { color: accent }]}>
                        {startLabel}
                      </Text>
                    </View>

                    <View style={styles.eventMain}>
                      <View style={styles.eventTitleRow}>
                        <PlannerEventIcon icon={ev.icon} color={accent} />
                        {ev.ataFileUrl ? (
                          <FileText size={13} color={colors.textSecondary} strokeWidth={2.2} />
                        ) : null}
                        <Text style={styles.eventTitle} numberOfLines={2}>
                          {ev.title}
                        </Text>
                      </View>
                      <Text style={styles.eventMeta} numberOfLines={1}>
                        {ongoing
                          ? 'Em andamento'
                          : endLabel
                            ? `${startLabel} – ${endLabel}`
                            : startLabel}
                        {attendees.length > 0
                          ? ` · ${attendees.length} pessoa${attendees.length === 1 ? '' : 's'}`
                          : ''}
                      </Text>
                    </View>
                    {ev.workOrderId && (ev.latitude != null || ev.address) ? (
                      <TouchableOpacity
                        onPress={() => {
                          const q =
                            ev.latitude != null && ev.longitude != null
                              ? `${ev.latitude},${ev.longitude}`
                              : encodeURIComponent(ev.address || '');
                          void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
                        }}
                        style={{ padding: 6 }}
                      >
                        <MapPin size={16} color={accent} />
                      </TouchableOpacity>
                    ) : null}
                    <View style={[styles.eventColorDot, { backgroundColor: accent }]} />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      ) : (
        <View style={styles.body}>
          <ScrollView
            horizontal
            style={styles.listChipsScroll}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.listChips}
          >
            {lists.map((list) => {
              const active = activeList?.id === list.id;
              return (
                <TouchableOpacity
                  key={list.id}
                  style={[styles.listChip, active && styles.listChipActive]}
                  onPress={() => setActiveListId(list.id)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.listChipText, active && styles.listChipTextActive]}>
                    {list.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.listChipAdd}
              onPress={() => setListModalOpen(true)}
              activeOpacity={0.75}
            >
              <Plus size={16} color={colors.primary} strokeWidth={2.2} />
            </TouchableOpacity>
          </ScrollView>

          <View style={styles.addTaskRow}>
            <View style={styles.addTaskField}>
              <TextInput
                value={newTaskTitle}
                onChangeText={setNewTaskTitle}
                placeholder="Nova tarefa..."
                placeholderTextColor={colors.textSecondary}
                style={styles.addTaskInput}
                onSubmitEditing={() => void addTask()}
                returnKeyType="done"
              />
              <TouchableOpacity
                style={[
                  styles.addTaskBtn,
                  (!newTaskTitle.trim() || !activeList) && styles.addTaskBtnDisabled,
                ]}
                onPress={() => void addTask()}
                disabled={!newTaskTitle.trim() || !activeList}
                activeOpacity={0.75}
              >
                <Plus size={18} color="#fff" strokeWidth={2.4} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            style={styles.tasksScroll}
            contentContainerStyle={styles.tasksPad}
            refreshControl={
              <RefreshControl
                refreshing={listsQuery.isRefetching}
                onRefresh={onRefresh}
                tintColor={colors.primary}
              />
            }
          >
            {listsQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
            ) : !activeList ? (
              <Text style={styles.empty}>Crie uma lista para começar.</Text>
            ) : (
              <>
                {openTasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    styles={styles}
                    colors={colors}
                    onToggle={() => void toggleTask(task)}
                    onStar={() => void toggleStar(task)}
                    onDelete={() => removeTask(task)}
                  />
                ))}
                {doneTasks.length > 0 ? (
                  <>
                    <Text style={styles.sectionLabel}>
                      Concluídas ({doneTasks.length})
                    </Text>
                    {doneTasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        styles={styles}
                        colors={colors}
                        onToggle={() => void toggleTask(task)}
                        onStar={() => void toggleStar(task)}
                        onDelete={() => removeTask(task)}
                      />
                    ))}
                  </>
                ) : null}
                {openTasks.length === 0 && doneTasks.length === 0 ? (
                  <Text style={styles.empty}>Nenhuma tarefa nesta lista.</Text>
                ) : null}
              </>
            )}
          </ScrollView>
        </View>
      )}

      {/* Event modal */}
      <Modal visible={!!eventModal} animationType="slide" transparent onRequestClose={() => setEventModal(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {eventModal?.mode === 'edit' ? 'Editar evento' : 'Novo evento'}
              </Text>
              <TouchableOpacity onPress={() => setEventModal(null)}>
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollPad}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.fieldLabel}>Ícone</Text>
              <View style={styles.iconRow}>
                <TouchableOpacity
                  style={[styles.iconChip, !eventIcon && styles.iconChipActive]}
                  onPress={() => setEventIcon(null)}
                >
                  <Text style={[styles.iconChipDash, !eventIcon && { color: colors.primary }]}>
                    —
                  </Text>
                </TouchableOpacity>
                {PLANNER_ICON_OPTIONS.map(({ id, label, Icon }) => {
                  const active = eventIcon === id;
                  return (
                    <TouchableOpacity
                      key={id}
                      style={[styles.iconChip, active && styles.iconChipActive]}
                      onPress={() => setEventIcon(id)}
                      accessibilityLabel={label}
                    >
                      <Icon
                        size={16}
                        color={active ? colors.primary : colors.textSecondary}
                        strokeWidth={2.2}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextInput
                value={eventTitle}
                onChangeText={setEventTitle}
                placeholder="Título"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
              />
              <TextInput
                value={eventDesc}
                onChangeText={setEventDesc}
                placeholder="Descrição (opcional)"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
                multiline
              />
              <View style={styles.timeRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Início (HH:mm)</Text>
                  <TextInput
                    value={eventStart}
                    onChangeText={setEventStart}
                    placeholder="09:00"
                    placeholderTextColor={colors.textSecondary}
                    style={styles.input}
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Fim (HH:mm)</Text>
                  <TextInput
                    value={eventEnd}
                    onChangeText={setEventEnd}
                    placeholder="10:00"
                    placeholderTextColor={colors.textSecondary}
                    style={styles.input}
                  />
                </View>
              </View>

              <Text style={styles.fieldLabel}>Cor</Text>
              <View style={styles.colorRow}>
                {EVENT_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[
                      styles.colorDot,
                      { backgroundColor: c },
                      eventColor === c && styles.colorDotActive,
                    ]}
                    onPress={() => setEventColor(c)}
                  />
                ))}
              </View>

              <Text style={styles.fieldLabel}>Pessoas</Text>
              <View style={styles.peopleActions}>
                {meUser?.id && !eventAttendees.some((a) => a.id === meUser.id) ? (
                  <TouchableOpacity style={styles.peopleBtn} onPress={assignToMe}>
                    <Text style={styles.peopleBtnText}>Atribuir a mim</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={styles.peopleBtn}
                  onPress={() => setMemberPickerOpen(true)}
                >
                  <Plus size={14} color={colors.primary} strokeWidth={2.4} />
                  <Text style={styles.peopleBtnText}>Adicionar</Text>
                </TouchableOpacity>
              </View>
              {eventAttendees.length === 0 ? (
                <Text style={styles.peopleEmpty}>Nenhuma pessoa atribuída.</Text>
              ) : (
                <View style={styles.peopleList}>
                  {eventAttendees.map((u) => (
                    <View key={u.id} style={styles.peopleChip}>
                      <UserAvatar
                        uri={u.profilePhotoUrl}
                        size={28}
                        backgroundColor={colors.primary}
                        iconColor="#fff"
                      />
                      <Text style={styles.peopleChipName} numberOfLines={1}>
                        {u.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() =>
                          setEventAttendees((prev) => prev.filter((a) => a.id !== u.id))
                        }
                        hitSlop={8}
                      >
                        <X size={14} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              <Text style={styles.fieldLabel}>Ata da reunião (PDF)</Text>
              <TouchableOpacity style={styles.ataPickBtn} onPress={() => void pickAtaPdf()}>
                <Upload size={16} color={colors.primary} strokeWidth={2.2} />
                <Text style={styles.ataPickText}>
                  {pendingAta ? 'Trocar PDF' : 'Selecionar PDF'}
                </Text>
              </TouchableOpacity>
              {pendingAta || (eventAtaUrl && !removeAtaOnSave) ? (
                <View style={styles.ataRow}>
                  <FileText size={16} color={colors.textSecondary} />
                  <Text style={styles.ataName} numberOfLines={1}>
                    {pendingAta?.name || eventAtaName || 'ata.pdf'}
                    {pendingAta ? ' (novo)' : ''}
                  </Text>
                  {!pendingAta && eventAtaUrl ? (
                    <TouchableOpacity
                      onPress={() => {
                        const url = resolveMediaUrl(eventAtaUrl);
                        if (url) void Linking.openURL(url);
                      }}
                      hitSlop={8}
                    >
                      <Download size={16} color={colors.primary} />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => {
                      if (pendingAta) {
                        setPendingAta(null);
                      } else {
                        setRemoveAtaOnSave(true);
                        setEventAtaUrl(null);
                        setEventAtaName(null);
                      }
                    }}
                    hitSlop={8}
                  >
                    <Trash2 size={15} color={colors.error} />
                  </TouchableOpacity>
                </View>
              ) : null}

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => void saveEvent()}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Salvar</Text>
                )}
              </TouchableOpacity>
              {eventModal?.mode === 'edit' && eventModal.event ? (
                <TouchableOpacity
                  style={styles.dangerBtn}
                  onPress={() => confirmDeleteEvent(eventModal.event!)}
                >
                  <Trash2 size={16} color={colors.error} />
                  <Text style={[styles.dangerBtnText, { color: colors.error }]}>Excluir</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Member picker */}
      <Modal
        visible={memberPickerOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setMemberPickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { maxHeight: '70%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Adicionar pessoa</Text>
              <TouchableOpacity onPress={() => setMemberPickerOpen(false)}>
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={memberSearch}
              onChangeText={setMemberSearch}
              placeholder="Buscar por nome ou CPF"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              autoFocus
            />
            {pickerUsersQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />
            ) : (
              <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                {filteredPickerUsers.length === 0 ? (
                  <Text style={styles.peopleEmpty}>Nenhuma pessoa encontrada.</Text>
                ) : (
                  filteredPickerUsers.map((u) => (
                    <PersonPickerListRow
                      key={u.id}
                      label={u.name}
                      subtitle={formatCpfDisplay(u.cpf) || u.email}
                      avatarUri={u.profilePhotoUrl}
                      colors={colors}
                      isDark={isDark}
                      onPress={() => addAttendee(u)}
                    />
                  ))
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* New list modal */}
      <Modal
        visible={listModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setListModalOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nova lista</Text>
            <TextInput
              value={newListTitle}
              onChangeText={setNewListTitle}
              placeholder="Nome da lista"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              autoFocus
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void createList()}>
              <Text style={styles.primaryBtnText}>Criar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setListModalOpen(false)} style={{ marginTop: 12 }}>
              <Text style={{ color: colors.textSecondary, textAlign: 'center' }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function TaskRow({
  task,
  styles,
  colors,
  onToggle,
  onStar,
  onDelete,
}: {
  task: PlannerTask;
  styles: ReturnType<typeof getStyles>;
  colors: { text: string; textSecondary: string; primary: string; warning: string };
  onToggle: () => void;
  onStar: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.taskRow, task.completed && styles.taskRowDone]}>
      <TouchableOpacity
        onPress={onToggle}
        style={[styles.check, task.completed && styles.checkDone]}
        hitSlop={6}
      >
        {task.completed ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
      </TouchableOpacity>
      <Text
        style={[styles.taskTitle, task.completed && styles.taskDone]}
        numberOfLines={2}
      >
        {task.title}
      </Text>
      <TouchableOpacity onPress={onStar} hitSlop={8} style={styles.taskAction}>
        <Star
          size={16}
          color={task.starred ? colors.warning : colors.textSecondary}
          fill={task.starred ? colors.warning : 'transparent'}
          strokeWidth={2}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.taskAction}>
        <Trash2 size={15} color={colors.textSecondary} strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );
}

function getStyles(colors: any, isDark: boolean) {
  const track = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';
  const selectedBg = isDark ? 'rgba(255,255,255,0.92)' : '#111827';
  const selectedFg = isDark ? '#111827' : '#fff';

  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.screenRoot },
    switcher: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginTop: 10,
      marginBottom: 8,
      padding: 4,
      borderRadius: 14,
      backgroundColor: track,
      position: 'relative',
    },
    switchPill: {
      position: 'absolute',
      top: 4,
      bottom: 4,
      left: 4,
      borderRadius: 10,
      shadowColor: '#000',
      shadowOpacity: isDark ? 0.2 : 0.06,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    switchBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      zIndex: 1,
    },
    switchText: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
    switchTextActive: { color: colors.primary, fontWeight: '600' },
    body: { flex: 1 },
    bodyPad: { paddingHorizontal: 20, paddingBottom: 40 },
    tasksScroll: { flex: 1 },
    tasksPad: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 40 },
    monthNavCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 8,
      marginBottom: 12,
      padding: 6,
      paddingLeft: 4,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    monthNavGroup: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      minWidth: 0,
    },
    monthNavBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    monthTitle: {
      flex: 1,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: -0.2,
    },
    todayBtn: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: track,
      marginRight: 2,
    },
    todayBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    calendarCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 10,
      paddingTop: 12,
      paddingBottom: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    weekRow: { flexDirection: 'row', marginBottom: 8 },
    weekLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 11,
      fontWeight: '500',
      color: colors.textSecondary,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    grid: { gap: 2 },
    weekLine: {
      flexDirection: 'row',
      alignItems: 'stretch',
    },
    dayCell: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
    },
    dayCircle: {
      width: 34,
      height: 34,
      borderRadius: 999,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayIdle: {
      backgroundColor: 'transparent',
      borderRadius: 999,
      overflow: 'hidden',
    },
    dayToday: {
      backgroundColor: colors.primary,
      borderRadius: 999,
      overflow: 'hidden',
    },
    daySelected: {
      backgroundColor: selectedBg,
      borderRadius: 999,
      overflow: 'hidden',
    },
    dayNum: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
      includeFontPadding: false,
    },
    dayNumToday: { color: '#fff', fontWeight: '600' },
    dayNumSelected: { color: selectedFg, fontWeight: '600' },
    dot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.primary,
      marginTop: 3,
    },
    dotOnToday: { backgroundColor: colors.primary },
    dotSelected: { backgroundColor: selectedBg },
    dotPlaceholder: {
      width: 4,
      height: 4,
      marginTop: 3,
      opacity: 0,
    },
    dayHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 18,
      marginBottom: 12,
      gap: 8,
    },
    dayHeaderTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      textTransform: 'capitalize',
      letterSpacing: -0.2,
    },
    addChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(206,55,54,0.18)' : 'rgba(206,55,54,0.1)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(206,55,54,0.35)' : 'rgba(206,55,54,0.25)',
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 10,
    },
    addChipText: { color: colors.primary, fontWeight: '600', fontSize: 13 },
    empty: {
      textAlign: 'left',
      color: colors.textSecondary,
      marginTop: 8,
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 20,
    },
    eventList: { gap: 8 },
    eventCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8F9FB',
      paddingVertical: 11,
      paddingHorizontal: 12,
    },
    eventTimeChip: {
      minWidth: 52,
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    eventTimeChipText: {
      fontSize: 12,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
    },
    eventMain: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    eventTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 19,
    },
    eventTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    eventMeta: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    eventColorDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    listChipsScroll: {
      flexGrow: 0,
      flexShrink: 0,
    },
    listChips: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 10,
      gap: 8,
      alignItems: 'center',
    },
    listChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    listChipActive: {
      backgroundColor: isDark ? 'rgba(206,55,54,0.18)' : 'rgba(206,55,54,0.1)',
      borderColor: isDark ? 'rgba(206,55,54,0.4)' : 'rgba(206,55,54,0.3)',
    },
    listChipText: { color: colors.text, fontWeight: '500', fontSize: 13 },
    listChipTextActive: { color: colors.primary, fontWeight: '600' },
    listChipAdd: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    addTaskRow: {
      paddingHorizontal: 20,
      marginBottom: 4,
    },
    addTaskField: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingLeft: 14,
      paddingRight: 6,
      paddingVertical: 6,
      gap: 8,
    },
    addTaskInput: {
      flex: 1,
      height: 36,
      color: colors.text,
      fontSize: 15,
      fontWeight: '500',
      padding: 0,
    },
    addTaskBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addTaskBtnDisabled: { opacity: 0.4 },
    taskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 12,
      marginBottom: 8,
      gap: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    taskRowDone: { opacity: 0.6 },
    check: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkDone: { backgroundColor: colors.primary, borderColor: colors.primary },
    taskTitle: { flex: 1, fontSize: 15, color: colors.text, fontWeight: '500' },
    taskDone: { textDecorationLine: 'line-through', color: colors.textSecondary },
    taskAction: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionLabel: {
      marginTop: 14,
      marginBottom: 8,
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'flex-end',
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: Platform.OS === 'ios' ? 28 : 20,
      maxHeight: '92%',
    },
    modalScroll: {
      flexGrow: 0,
    },
    modalScrollPad: {
      paddingBottom: 12,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
    input: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.background,
      color: colors.text,
      fontSize: 15,
      marginBottom: 10,
    },
    timeRow: { flexDirection: 'row' },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: 4,
    },
    iconRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    iconChip: {
      width: 36,
      height: 36,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    iconChipActive: {
      borderColor: colors.primary,
      backgroundColor: isDark ? 'rgba(206,55,54,0.18)' : 'rgba(206,55,54,0.08)',
    },
    iconChipDash: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
    colorDot: { width: 28, height: 28, borderRadius: 14 },
    colorDotActive: { borderWidth: 3, borderColor: '#fff', elevation: 2 },
    peopleActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 8,
    },
    peopleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 8,
      backgroundColor: colors.background,
    },
    peopleBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.primary,
    },
    peopleEmpty: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 10,
    },
    peopleList: {
      gap: 8,
      marginBottom: 12,
    },
    peopleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    peopleChipName: {
      flex: 1,
      minWidth: 0,
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    ataPickBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      paddingVertical: 12,
      marginBottom: 8,
    },
    ataPickText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    ataRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14,
      paddingHorizontal: 4,
    },
    ataName: {
      flex: 1,
      minWidth: 0,
      fontSize: 13,
      fontWeight: '500',
      color: colors.text,
    },
    pickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    pickerName: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    pickerEmail: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 1,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 6,
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    dangerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 14,
      paddingVertical: 10,
    },
    dangerBtnText: { fontWeight: '600', fontSize: 14 },
  });
}
