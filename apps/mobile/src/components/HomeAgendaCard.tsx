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
import type { RootStackParamList } from '../../App';

type TodayItem = {
  id: string;
  title: string;
  sortAt: number;
  expiresAt: number;
  timeStart: string;
  timeRange: string | null;
  accent: string;
  ongoing: boolean;
};

const MAX_ITEMS = 5;

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

function formatClock(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function buildTodayEvents(events: PlannerEvent[], nowMs: number): TodayItem[] {
  const items: TodayItem[] = [];

  for (const ev of events) {
    const start = new Date(ev.startAt);
    if (Number.isNaN(start.getTime())) continue;
    const end = new Date(ev.endAt);
    const endMs = Number.isNaN(end.getTime()) ? start.getTime() : end.getTime();
    const hasRange = !Number.isNaN(end.getTime()) && endMs > start.getTime();

    items.push({
      id: ev.id,
      title: ev.title,
      sortAt: start.getTime(),
      expiresAt: endMs,
      timeStart: formatClock(start),
      timeRange: hasRange ? `${formatClock(start)} – ${formatClock(end)}` : null,
      accent: ev.color || '#3B82F6',
      ongoing: start.getTime() <= nowMs && endMs >= nowMs,
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

  const { data: todayEvents = [], isLoading } = useQuery({
    queryKey: ['planner-events', 'home-today', todayRange.from.toISOString()],
    queryFn: async () => {
      const { events } = await fetchPlannerEvents(todayRange.from, todayRange.to);
      return events;
    },
    staleTime: 60_000,
  });

  const todayItems = useMemo(() => {
    const items = buildTodayEvents(todayEvents, now.getTime());
    return items.filter((item) => item.expiresAt >= now.getTime());
  }, [todayEvents, now]);

  const visibleItems = todayItems.slice(0, MAX_ITEMS);
  const hiddenCount = Math.max(0, todayItems.length - visibleItems.length);
  const openAgenda = () => navigation.navigate('Agenda', { mode: 'agenda' });

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

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : todayItems.length === 0 ? (
        <Text style={styles.empty}>Nenhum evento para hoje.</Text>
      ) : (
        <View style={styles.list}>
          {visibleItems.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.eventRow,
                index === 0 && styles.eventRowFirst,
              ]}
              onPress={openAgenda}
              activeOpacity={0.7}
            >
              <View style={[styles.accentBar, { backgroundColor: item.accent }]} />
              <Text style={styles.timeText}>{item.timeStart}</Text>
              <View style={styles.eventMain}>
                <Text style={styles.eventTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text
                  style={[styles.eventMeta, item.ongoing && styles.eventMetaOngoing]}
                  numberOfLines={1}
                >
                  {item.ongoing ? 'Em andamento' : item.timeRange || item.timeStart}
                </Text>
              </View>
            </TouchableOpacity>
          ))}

          {hiddenCount > 0 ? (
            <TouchableOpacity onPress={openAgenda} activeOpacity={0.7} hitSlop={6}>
              <Text style={styles.more}>Ver todos ({todayItems.length})</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
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
    list: {},
    eventRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    eventRowFirst: {
      borderTopWidth: 0,
      paddingTop: 2,
    },
    accentBar: {
      width: 2,
      height: 28,
      borderRadius: 1,
    },
    timeText: {
      width: 42,
      fontSize: 12,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      color: colors.textSecondary,
    },
    eventMain: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    eventTitle: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
      lineHeight: 19,
    },
    eventMeta: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    eventMetaOngoing: {
      fontWeight: '600',
      color: colors.primary,
    },
    more: {
      marginTop: 8,
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
  });
