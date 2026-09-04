import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, ExternalLink, Star } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import {
  fetchPlannerTaskLists,
  toDateInputValue,
  toTimeInputValue,
  updatePlannerTask,
  type PlannerTask,
} from '../services/plannerTasks';
import type { RootStackParamList } from '../../App';

const MAX_ITEMS = 5;

type TaskPreview = {
  task: PlannerTask;
  dueLabel: string | null;
  sortAt: number;
  overdue: boolean;
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function hasMeaningfulTime(date: Date): boolean {
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}

function buildPreviews(tasks: PlannerTask[], now: Date): TaskPreview[] {
  const todayKey = toDateInputValue(now);
  const todayStart = startOfDay(now).getTime();
  const rows: TaskPreview[] = [];

  for (const task of tasks) {
    if (task.completed) continue;

    let dueLabel: string | null = null;
    let sortAt = Number.POSITIVE_INFINITY;
    let overdue = false;

    if (task.dueDate) {
      const due = new Date(task.dueDate);
      if (!Number.isNaN(due.getTime())) {
        sortAt = due.getTime();
        const dueKey = toDateInputValue(due);
        const time = toTimeInputValue(due);
        if (dueKey === todayKey) {
          dueLabel = hasMeaningfulTime(due) && time ? time : 'Hoje';
        } else if (startOfDay(due).getTime() < todayStart) {
          dueLabel = 'Atrasada';
          overdue = true;
        } else {
          dueLabel = due.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'short',
          });
        }
      }
    }

    rows.push({ task, dueLabel, sortAt, overdue });
  }

  return rows.sort((a, b) => {
    if (a.task.starred !== b.task.starred) return a.task.starred ? -1 : 1;
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.sortAt !== b.sortAt) return a.sortAt - b.sortAt;
    return a.task.title.localeCompare(b.task.title, 'pt-BR');
  });
}

export default function HomeTarefasCard() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const now = useMemo(() => new Date(), []);

  const { data: lists = [], isLoading } = useQuery({
    queryKey: ['planner-task-lists'],
    queryFn: fetchPlannerTaskLists,
    staleTime: 60_000,
  });

  const openTasks = useMemo(
    () => lists.flatMap((list) => list.tasks || []).filter((t) => !t.completed),
    [lists],
  );

  const rows = useMemo(() => buildPreviews(openTasks, now), [openTasks, now]);
  const visible = rows.slice(0, MAX_ITEMS);
  const hiddenCount = Math.max(0, rows.length - visible.length);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['planner-task-lists'] });
  };

  const toggleMut = useMutation({
    mutationFn: (task: PlannerTask) =>
      updatePlannerTask(task.id, { completed: !task.completed }),
    onMutate: (task) => setBusyId(task.id),
    onSettled: () => {
      setBusyId(null);
      invalidate();
    },
  });

  const starMut = useMutation({
    mutationFn: (task: PlannerTask) =>
      updatePlannerTask(task.id, { starred: !task.starred }),
    onMutate: (task) => setBusyId(task.id),
    onSettled: () => {
      setBusyId(null);
      invalidate();
    },
  });

  const openTarefas = () => navigation.navigate('Agenda', { mode: 'tasks' });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}>
            <CheckSquare size={20} color={colors.primary} strokeWidth={2.2} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Tarefas</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {isLoading
                ? 'Carregando…'
                : rows.length === 0
                  ? 'Nenhuma pendente'
                  : `${rows.length} pendente${rows.length === 1 ? '' : 's'}`}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={openTarefas}
          style={styles.openBtn}
          hitSlop={10}
          accessibilityLabel="Abrir tarefas"
        >
          <ExternalLink size={16} color={colors.textSecondary} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>Nenhuma tarefa pendente.</Text>
      ) : (
        <View style={styles.list}>
          {visible.map(({ task, dueLabel, overdue }, index) => {
            const busy = busyId === task.id;
            return (
              <View
                key={task.id}
                style={[styles.taskRow, index === 0 && styles.taskRowFirst]}
              >
                <TouchableOpacity
                  onPress={() => toggleMut.mutate(task)}
                  disabled={busy}
                  style={[styles.check, busy && styles.checkBusy]}
                  hitSlop={6}
                  accessibilityLabel={`Concluir ${task.title}`}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : null}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.taskMain}
                  onPress={openTarefas}
                  activeOpacity={0.7}
                >
                  <Text style={styles.taskTitle} numberOfLines={1}>
                    {task.title}
                  </Text>
                </TouchableOpacity>

                {dueLabel ? (
                  <Text
                    style={[styles.dueLabel, overdue && styles.dueOverdue]}
                    numberOfLines={1}
                  >
                    {dueLabel}
                  </Text>
                ) : null}

                <TouchableOpacity
                  onPress={() => starMut.mutate(task)}
                  disabled={busy}
                  hitSlop={8}
                  style={styles.starBtn}
                  accessibilityLabel={
                    task.starred ? 'Remover estrela' : 'Marcar com estrela'
                  }
                >
                  <Star
                    size={14}
                    color={
                      task.starred
                        ? colors.warning || '#F59E0B'
                        : isDark
                          ? '#6B7280'
                          : '#D1D5DB'
                    }
                    fill={task.starred ? colors.warning || '#F59E0B' : 'transparent'}
                    strokeWidth={2}
                  />
                </TouchableOpacity>
              </View>
            );
          })}

          {hiddenCount > 0 ? (
            <TouchableOpacity onPress={openTarefas} activeOpacity={0.7} hitSlop={6}>
              <Text style={styles.more}>Ver todas ({rows.length})</Text>
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
    taskRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    taskRowFirst: {
      borderTopWidth: 0,
      paddingTop: 2,
    },
    check: {
      width: 18,
      height: 18,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    checkBusy: {
      borderColor: colors.primary,
    },
    taskMain: {
      flex: 1,
      minWidth: 0,
    },
    taskTitle: {
      fontSize: 14,
      fontWeight: '400',
      color: colors.text,
      lineHeight: 19,
    },
    dueLabel: {
      fontSize: 12,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
      color: colors.textSecondary,
    },
    dueOverdue: {
      fontWeight: '600',
      color: colors.primary,
    },
    starBtn: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    more: {
      marginTop: 8,
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
  });
