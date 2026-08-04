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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import AppHeader from '../components/AppHeader';
import { useTheme } from '../context/ThemeContext';
import {
  createPlannerEvent,
  deletePlannerEvent,
  EVENT_COLORS,
  fetchPlannerEvents,
  updatePlannerEvent,
  type PlannerEvent,
} from '../services/plannerEvents';
import {
  createPlannerTask,
  createPlannerTaskList,
  deletePlannerTask,
  fetchPlannerTaskLists,
  updatePlannerTask,
  type PlannerTask,
  type PlannerTaskList,
} from '../services/plannerTasks';

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

export default function AgendaScreen() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [mode, setMode] = useState<Mode>('agenda');
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

  const listsQuery = useQuery({
    queryKey: ['planner-task-lists'],
    queryFn: fetchPlannerTaskLists,
    enabled: mode === 'tasks',
  });

  const events = eventsQuery.data?.events ?? [];
  const canWrite = eventsQuery.data?.meta?.canWrite !== false;
  const lists = listsQuery.data ?? [];
  const activeList: PlannerTaskList | undefined =
    lists.find((l) => l.id === activeListId) || lists[0];

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
    setEventModal({ mode: 'create' });
  };

  const openEditEvent = (ev: PlannerEvent) => {
    setEventTitle(ev.title);
    setEventDesc(ev.description || '');
    setEventStart(formatTime(ev.startAt) || '09:00');
    setEventEnd(formatTime(ev.endAt) || '10:00');
    setEventColor(ev.color || EVENT_COLORS[0]);
    setEventModal({ mode: 'edit', event: ev });
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
      if (eventModal?.mode === 'edit' && eventModal.event) {
        await updatePlannerEvent(eventModal.event.id, {
          title,
          description: eventDesc.trim(),
          startAt,
          endAt,
          color: eventColor,
        });
        Toast.show({ type: 'success', text1: 'Evento atualizado' });
      } else {
        await createPlannerEvent({
          title,
          description: eventDesc.trim(),
          startAt,
          endAt,
          color: eventColor,
        });
        Toast.show({ type: 'success', text1: 'Evento criado' });
      }
      setEventModal(null);
      await queryClient.invalidateQueries({ queryKey: ['planner-events'] });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: 'Erro', text2: e?.message || 'Falha ao salvar' });
    } finally {
      setSaving(false);
    }
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
    if (mode === 'agenda') void eventsQuery.refetch();
    else void listsQuery.refetch();
  }, [mode, eventsQuery, listsQuery]);

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

          {eventsQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
          ) : dayEvents.length === 0 ? (
            <Text style={styles.empty}>Nenhum evento neste dia.</Text>
          ) : (
            <View style={styles.eventList}>
              {dayEvents.map((ev, index) => (
                <TouchableOpacity
                  key={ev.id}
                  style={styles.eventRow}
                  onPress={() => canWrite && openEditEvent(ev)}
                  activeOpacity={0.75}
                >
                  <View style={styles.eventTimeline}>
                    {index < dayEvents.length - 1 ? <View style={styles.eventLine} /> : null}
                    <View
                      style={[
                        styles.eventDot,
                        { backgroundColor: ev.color || colors.primary },
                      ]}
                    />
                  </View>
                  <View style={styles.eventBody}>
                    <Text style={styles.eventTime}>
                      {formatTime(ev.startAt)} – {formatTime(ev.endAt)}
                    </Text>
                    <Text style={styles.eventTitle} numberOfLines={2}>
                      {ev.title}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
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
          </View>
        </KeyboardAvoidingView>
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
    safe: { flex: 1, backgroundColor: colors.background },
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
    eventList: { gap: 0 },
    eventRow: {
      flexDirection: 'row',
      gap: 12,
      paddingBottom: 14,
    },
    eventTimeline: {
      width: 12,
      alignItems: 'center',
      position: 'relative',
    },
    eventLine: {
      position: 'absolute',
      top: 8,
      bottom: 0,
      width: StyleSheet.hairlineWidth * 2,
      backgroundColor: colors.border,
    },
    eventDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginTop: 4,
      zIndex: 1,
    },
    eventBody: {
      flex: 1,
      minWidth: 0,
      paddingBottom: 2,
    },
    eventTime: {
      fontSize: 12,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      color: colors.primary,
    },
    eventTitle: {
      marginTop: 2,
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 20,
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
      paddingBottom: 32,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: 8 },
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
    },
    colorRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    colorDot: { width: 28, height: 28, borderRadius: 14 },
    colorDotActive: { borderWidth: 3, borderColor: '#fff', elevation: 2 },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
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
