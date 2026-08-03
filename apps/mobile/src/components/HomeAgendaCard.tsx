import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ExternalLink } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { fetchPlannerEvents, type PlannerEvent } from '../services/plannerEvents';
import {
  fetchPlannerTasks,
  toTimeInputValue,
  type PlannerTask,
} from '../services/plannerTasks';
import type { RootStackParamList } from '../../App';

type TodayItem = {
  id: string;
  kind: 'event' | 'task';
  title: string;
  sortAt: number;
  expiresAt: number;
  timeLabel: string;
  color?: string;
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function buildTodayItems(events: PlannerEvent[], tasks: PlannerTask[]): TodayItem[] {
  const items: TodayItem[] = [];

  for (const ev of events) {
    const start = new Date(ev.startAt);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(ev.endAt);
    const expiresAt = Number.isNaN(end.getTime()) ? start.getTime() : end.getTime();
    items.push({
      id: `ev-${ev.id}`,
      kind: 'event',
      title: ev.title,
      sortAt: start.getTime(),
      expiresAt,
      timeLabel: start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      color: ev.color || '#3B82F6',
    });
  }

  for (const task of tasks) {
    if (!task.dueDate || task.completed) continue;
    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) continue;
    const time = toTimeInputValue(task.dueDate);
    items.push({
      id: `task-${task.id}`,
      kind: 'task',
      title: task.title,
      sortAt: due.getTime(),
      expiresAt: due.getTime(),
      timeLabel: time || '—',
    });
  }

  return items.sort((a, b) => a.sortAt - b.sortAt);
}

export default function HomeAgendaCard() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors, isDark);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const todayRange = useMemo(() => {
    const from = startOfDay(now);
    return { from, to: addDays(from, 1) };
  }, [now]);

  const formattedDate = useMemo(
    () =>
      now.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [now],
  );

  const { data: todayEvents = [], isLoading: loadingEvents } = useQuery({
    queryKey: ['planner-events', 'home-today', todayRange.from.toISOString()],
    queryFn: async () => {
      const { events } = await fetchPlannerEvents(todayRange.from, todayRange.to);
      return events;
    },
    staleTime: 60_000,
  });

  const { data: todayTasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ['planner-tasks', 'home-today', todayRange.from.toISOString()],
    queryFn: () =>
      fetchPlannerTasks({
        from: todayRange.from,
        to: todayRange.to,
        withDue: true,
        includeCompleted: false,
      }),
    staleTime: 60_000,
  });

  const todayItems = useMemo(() => {
    const items = buildTodayItems(todayEvents, todayTasks);
    const cutoff = now.getTime();
    return items.filter((item) => item.expiresAt >= cutoff);
  }, [todayEvents, todayTasks, now]);

  const loading = loadingEvents || loadingTasks;
  const openAgenda = () => navigation.navigate('Agenda');

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}>
            <CalendarClock size={20} color={colors.primary} strokeWidth={2.2} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Agenda</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {formattedDate}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={openAgenda}
          style={styles.openBtn}
          hitSlop={10}
          accessibilityLabel="Abrir agenda"
        >
          <ExternalLink size={16} color={colors.textSecondary} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : todayItems.length === 0 ? (
        <Text style={styles.empty}>Nada marcado na agenda para hoje.</Text>
      ) : (
        <View style={styles.list}>
          {todayItems.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={styles.row}
              onPress={openAgenda}
              activeOpacity={0.7}
            >
              <View style={styles.timeline}>
                {index < todayItems.length - 1 ? <View style={styles.line} /> : null}
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor:
                        item.kind === 'event' ? item.color || '#3B82F6' : '#F59E0B',
                    },
                  ]}
                />
              </View>
              <View style={styles.itemBody}>
                <View style={styles.metaRow}>
                  <Text style={styles.time}>{item.timeLabel}</Text>
                  <Text style={styles.kind}>
                    {item.kind === 'task' ? 'Tarefa' : 'Evento'}
                  </Text>
                </View>
                <Text style={styles.itemTitle} numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const getStyles = (colors: any, _isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 14,
    },
    headerLeft: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}14`,
    },
    headerText: { flex: 1, minWidth: 0 },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      textTransform: 'capitalize',
    },
    openBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingWrap: {
      paddingVertical: 12,
      alignItems: 'flex-start',
    },
    empty: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
      lineHeight: 20,
    },
    list: {
      gap: 0,
    },
    row: {
      flexDirection: 'row',
      gap: 12,
      paddingBottom: 16,
    },
    timeline: {
      width: 10,
      alignItems: 'center',
      position: 'relative',
    },
    line: {
      position: 'absolute',
      top: 6,
      bottom: 0,
      width: StyleSheet.hairlineWidth * 2,
      backgroundColor: colors.border,
    },
    dot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginTop: 4,
      zIndex: 1,
    },
    itemBody: {
      flex: 1,
      minWidth: 0,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 8,
    },
    time: {
      fontSize: 12,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      color: colors.primary,
    },
    kind: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      color: colors.textSecondary,
    },
    itemTitle: {
      marginTop: 2,
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 20,
    },
  });
