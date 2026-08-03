import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  MessageSquare,
  Paperclip,
  ListChecks,
  Calendar,
  LayoutGrid,
  X,
} from 'lucide-react-native';
import Svg, { Circle } from 'react-native-svg';
import Toast from 'react-native-toast-message';
import AppHeader from '../../components/AppHeader';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { resolveKanbanDefaultBoard } from '../../lib/kanbanDefaultBoard';
import {
  createKanbanCard,
  createKanbanColumn,
  fetchKanbanBoard,
  fetchKanbanBoards,
  type KanbanCard,
  type KanbanColumn,
  type Priority,
} from '../../services/kanban';
import type { RootStackParamList } from '../../../App';

const COL_WIDTH = Math.min(300, Dimensions.get('window').width * 0.78);
/** Mesmo espaço entre colunas, nas laterais e embaixo. */
const BOARD_GAP = 12;

const COLUMN_COLORS = [
  '#6B7280',
  '#14B8A6',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#EF4444',
  '#10B981',
];

const PRIORITY_CONFIG: Record<
  Priority,
  { label: string; bars: number; barColor: string }
> = {
  low: { label: 'Baixa', bars: 1, barColor: '#10b981' },
  medium: { label: 'Média', bars: 2, barColor: '#f59e0b' },
  high: { label: 'Alta', bars: 3, barColor: '#f97316' },
  critical: { label: 'Urgente', bars: 4, barColor: '#ef4444' },
};

function formatCardEndDate(end: string | null | undefined): string {
  if (!end) return '';
  const datePart = end.includes('T') ? end.slice(0, 10) : end.slice(0, 10);
  const d = new Date(`${datePart}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const monthSlug = d
    .toLocaleDateString('pt-BR', { month: 'short' })
    .replace(/\./g, '')
    .trim();
  const month = monthSlug.charAt(0).toUpperCase() + monthSlug.slice(1);
  return `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

function PriorityBars({
  priority,
  mutedColor,
}: {
  priority: Priority;
  mutedColor: string;
}) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <View style={stylesLocal.priorityBars}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[
            stylesLocal.priorityBar,
            {
              height: 6 + i * 2,
              backgroundColor: i <= cfg.bars ? cfg.barColor : mutedColor,
            },
          ]}
        />
      ))}
    </View>
  );
}

function ProgressRing({
  value,
  textColor,
}: {
  value: number;
  textColor: string;
}) {
  const size = 22;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <View style={stylesLocal.progressWrap}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#FEE2E2"
          strokeWidth={stroke}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#DC2626"
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </Svg>
      <Text style={[stylesLocal.progressPct, { color: textColor }]}>{clamped}%</Text>
    </View>
  );
}

function BoardCard({
  card,
  styles,
  colors,
  isDark,
  onPress,
}: {
  card: KanbanCard;
  styles: ReturnType<typeof getStyles>;
  colors: any;
  isDark: boolean;
  onPress: () => void;
}) {
  const labels = Array.isArray(card.labels) ? card.labels : [];
  const dateLabel = formatCardEndDate(card.endDate);
  const hasTasks = Boolean(card.checklistEnabled) && card.totalTasks > 0;
  const hasDate = Boolean(dateLabel);
  const description = card.description?.trim() || '';
  const priority = card.priority || 'medium';
  const priorityCfg = PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.medium;
  const mutedBar = isDark ? '#4b5563' : '#d1d5db';
  const divider = isDark ? 'rgba(75,85,99,0.75)' : '#f3f4f6';
  const metaColor = isDark ? '#d1d5db' : '#4b5563';
  const softColor = isDark ? '#9ca3af' : '#6b7280';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.82}
    >
      {labels.length > 0 ? (
        <View style={styles.labels}>
          {labels.slice(0, 5).map((l, i) => (
            <View
              key={`${l.color}-${i}`}
              style={[styles.labelChip, { backgroundColor: l.color || colors.primary }]}
            />
          ))}
        </View>
      ) : null}

      <Text style={styles.cardTitle} numberOfLines={3}>
        {card.title?.trim() ? card.title : 'Sem título'}
      </Text>

      {description ? (
        <Text style={styles.cardDescription} numberOfLines={2}>
          {description}
        </Text>
      ) : null}

      <View style={styles.metaRow}>
        <View style={styles.metaLeft}>
          {hasDate ? (
            <View style={styles.metaItem}>
              <Calendar size={13} color={metaColor} strokeWidth={2.2} />
              <Text style={[styles.metaText, { color: metaColor }]} numberOfLines={1}>
                {dateLabel}
              </Text>
            </View>
          ) : null}

          {hasDate && hasTasks ? <View style={[styles.metaDivider, { backgroundColor: mutedBar }]} /> : null}

          {hasTasks ? (
            <>
              <View style={styles.metaItem}>
                <Paperclip size={13} color={metaColor} strokeWidth={2.2} />
                <Text style={[styles.metaText, { color: metaColor }]}>{card.attachments ?? 0}</Text>
              </View>
              <View style={styles.metaItem}>
                <MessageSquare size={13} color={metaColor} strokeWidth={2.2} />
                <Text style={[styles.metaText, { color: metaColor }]}>{card.comments ?? 0}</Text>
              </View>
            </>
          ) : null}
        </View>

        <View style={styles.priorityWrap}>
          <PriorityBars priority={priority} mutedColor={mutedBar} />
          <Text style={[styles.priorityLabel, { color: metaColor }]}>{priorityCfg.label}</Text>
        </View>
      </View>

      <View style={[styles.cardFooter, { borderTopColor: divider }]}>
        {hasTasks ? (
          <>
            <ProgressRing value={card.progress ?? 0} textColor={metaColor} />
            <View style={styles.tasksCenter}>
              <ListChecks size={14} color={softColor} strokeWidth={2.2} />
              <Text style={[styles.tasksText, { color: softColor }]}>
                {card.completedTasks}/{card.totalTasks} Tasks
              </Text>
            </View>
          </>
        ) : (
          <View style={styles.footerCounts}>
            <View style={styles.metaItem}>
              <Paperclip size={13} color={metaColor} strokeWidth={2.2} />
              <Text style={[styles.metaText, { color: metaColor }]}>{card.attachments ?? 0}</Text>
            </View>
            <View style={styles.metaItem}>
              <MessageSquare size={13} color={metaColor} strokeWidth={2.2} />
              <Text style={[styles.metaText, { color: metaColor }]}>{card.comments ?? 0}</Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function KanbanBoardScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'KanbanBoard'>>();
  const paramKey = route.params?.departmentKey;
  const paramTitle = route.params?.title;
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const [boardAreaH, setBoardAreaH] = useState(0);
  const columnHeight = Math.max(0, boardAreaH - BOARD_GAP * 2);
  const styles = useMemo(
    () => getStyles(colors, isDark, columnHeight),
    [colors, isDark, columnHeight],
  );
  const queryClient = useQueryClient();

  const [departmentKey, setDepartmentKey] = useState<string | undefined>(paramKey);
  const [headerTitle, setHeaderTitle] = useState<string | undefined>(paramTitle);
  const [resolvingDefault, setResolvingDefault] = useState(!paramKey);

  const [addColId, setAddColId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [newColumnTitle, setNewColumnTitle] = useState('');
  const [newColumnColor, setNewColumnColor] = useState(COLUMN_COLORS[0]);
  const [savingColumn, setSavingColumn] = useState(false);

  useEffect(() => {
    if (paramKey) {
      setDepartmentKey(paramKey);
      if (paramTitle) setHeaderTitle(paramTitle);
      setResolvingDefault(false);
      return;
    }
    let cancelled = false;
    setResolvingDefault(true);
    void (async () => {
      try {
        const boards = await fetchKanbanBoards();
        const key = await resolveKanbanDefaultBoard(user?.id, boards);
        const name = boards.find((b) => b.departmentKey === key)?.department;
        if (!cancelled) {
          setDepartmentKey(key ?? undefined);
          if (name) setHeaderTitle(name);
          navigation.setParams({
            departmentKey: key ?? undefined,
            title: name || undefined,
          });
        }
      } catch {
        if (!cancelled) setDepartmentKey(undefined);
      } finally {
        if (!cancelled) setResolvingDefault(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [paramKey, paramTitle, user?.id, navigation]);

  const boardQuery = useQuery({
    queryKey: ['kanban-board', departmentKey ?? 'own'],
    queryFn: () => fetchKanbanBoard(departmentKey),
    enabled: !resolvingDefault,
  });

  const board = boardQuery.data;
  const readOnly = board?.canWrite === false;
  const displayTitle = board?.department || headerTitle;

  const openCard = (card: KanbanCard) => {
    navigation.navigate('KanbanCard', {
      cardId: card.id,
      departmentKey: board?.departmentKey ?? departmentKey,
    });
  };

  const addCard = async () => {
    const title = newTitle.trim();
    if (!title || !addColId) return;
    setSaving(true);
    try {
      await createKanbanCard({ columnId: addColId, title, insertAt: 'bottom' });
      setNewTitle('');
      setAddColId(null);
      await queryClient.invalidateQueries({
        queryKey: ['kanban-board', departmentKey ?? 'own'],
      });
      Toast.show({ type: 'success', text1: 'Card criado' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao criar' });
    } finally {
      setSaving(false);
    }
  };

  const addColumn = async () => {
    const title = newColumnTitle.trim();
    if (!title) {
      Toast.show({ type: 'error', text1: 'Informe o nome da coluna' });
      return;
    }
    setSavingColumn(true);
    try {
      await createKanbanColumn({
        title,
        color: newColumnColor,
        boardId: board?.id,
      });
      setNewColumnTitle('');
      setNewColumnColor(COLUMN_COLORS[0]);
      setAddColumnOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ['kanban-board', departmentKey ?? 'own'],
      });
      Toast.show({ type: 'success', text1: 'Coluna criada' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao criar coluna' });
    } finally {
      setSavingColumn(false);
    }
  };

  return (
    <View style={styles.safe}>
      <AppHeader
        showBack
        title={displayTitle}
        onBack={() => navigation.goBack()}
        rightAction={
          <TouchableOpacity
            onPress={() => navigation.navigate('KanbanBoards')}
            hitSlop={8}
            accessibilityLabel="Trocar de quadro"
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            activeOpacity={0.7}
          >
            <LayoutGrid size={22} color={colors.text} strokeWidth={2.1} />
          </TouchableOpacity>
        }
      />

      {(resolvingDefault || (boardQuery.isLoading && !board)) ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <View
          style={styles.boardArea}
          onLayout={(e) => setBoardAreaH(e.nativeEvent.layout.height)}
        >
          <ScrollView
            horizontal
            style={styles.boardScroll}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.boardPad}
            refreshControl={
              <RefreshControl
                refreshing={boardQuery.isRefetching}
                onRefresh={() => void boardQuery.refetch()}
                tintColor={colors.primary}
              />
            }
          >
            {(board?.columns ?? []).map((col) => (
              <Column
                key={col.id}
                column={col}
                styles={styles}
                colors={colors}
                isDark={isDark}
                readOnly={readOnly}
                onOpenCard={openCard}
                onAdd={() => {
                  setNewTitle('');
                  setAddColId(col.id);
                }}
              />
            ))}

            {!readOnly ? (
              <TouchableOpacity
                style={styles.newColumnBtn}
                onPress={() => {
                  setNewColumnTitle('');
                  setNewColumnColor(
                    COLUMN_COLORS[(board?.columns?.length ?? 0) % COLUMN_COLORS.length],
                  );
                  setAddColumnOpen(true);
                }}
                activeOpacity={0.75}
              >
                <View style={styles.newColumnInner}>
                  <Plus size={22} color={colors.textSecondary} strokeWidth={2.4} />
                  <Text style={styles.newColumnText}>Nova coluna</Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </ScrollView>
        </View>
      )}

      <Modal
        visible={!!addColId}
        transparent
        animationType="fade"
        onRequestClose={() => setAddColId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Novo card</Text>
              <TouchableOpacity onPress={() => setAddColId(null)}>
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={newTitle}
              onChangeText={setNewTitle}
              placeholder="Título do card"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              autoFocus
              onSubmitEditing={() => void addCard()}
            />
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => void addCard()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Criar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={addColumnOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddColumnOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nova coluna</Text>
              <TouchableOpacity onPress={() => setAddColumnOpen(false)}>
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={newColumnTitle}
              onChangeText={setNewColumnTitle}
              placeholder="Nome da coluna"
              placeholderTextColor={colors.textSecondary}
              style={styles.input}
              autoFocus
              onSubmitEditing={() => void addColumn()}
            />
            <Text style={styles.colorLabel}>Cor</Text>
            <View style={styles.colorRow}>
              {COLUMN_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setNewColumnColor(c)}
                  style={[
                    styles.colorSwatch,
                    { backgroundColor: c },
                    newColumnColor === c && styles.colorSwatchActive,
                  ]}
                />
              ))}
            </View>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => void addColumn()}
              disabled={savingColumn}
            >
              {savingColumn ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Criar coluna</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Column({
  column,
  styles,
  colors,
  isDark,
  readOnly,
  onOpenCard,
  onAdd,
}: {
  column: KanbanColumn;
  styles: ReturnType<typeof getStyles>;
  colors: any;
  isDark: boolean;
  readOnly: boolean;
  onOpenCard: (c: KanbanCard) => void;
  onAdd: () => void;
}) {
  return (
    <View style={styles.column}>
      <View style={styles.colHeader}>
        <View style={[styles.colDot, { backgroundColor: column.color || colors.primary }]} />
        <Text style={styles.colTitle} numberOfLines={1}>
          {column.title}
        </Text>
        <Text style={styles.colCount}>{column.cards.length}</Text>
      </View>

      <ScrollView
        style={styles.colScroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.colScrollContent}
      >
        {column.cards.map((card) => (
          <BoardCard
            key={card.id}
            card={card}
            styles={styles}
            colors={colors}
            isDark={isDark}
            onPress={() => onOpenCard(card)}
          />
        ))}
      </ScrollView>

      {!readOnly ? (
        <TouchableOpacity style={styles.addCardBtn} onPress={onAdd} activeOpacity={0.7}>
          <Plus size={16} color={colors.textSecondary} strokeWidth={2.4} />
          <Text style={styles.addCardText}>Adicionar card</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const stylesLocal = StyleSheet.create({
  priorityBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 14,
  },
  priorityBar: {
    width: 3,
    borderRadius: 2,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressPct: {
    minWidth: 34,
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

function getStyles(colors: any, isDark: boolean, columnHeight: number) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    boardArea: {
      flex: 1,
    },
    boardScroll: {
      flex: 1,
    },
    boardPad: {
      paddingHorizontal: BOARD_GAP,
      paddingVertical: BOARD_GAP,
      gap: BOARD_GAP,
      alignItems: 'flex-start',
    },
    column: {
      width: COL_WIDTH,
      height: columnHeight > 0 ? columnHeight : undefined,
      maxHeight: columnHeight > 0 ? columnHeight : undefined,
      backgroundColor: isDark ? 'rgba(31, 41, 55, 0.72)' : '#F9FAFB',
      borderRadius: 18,
      padding: 10,
      flexDirection: 'column',
    },
    colHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 6,
      paddingTop: 4,
      marginBottom: 12,
      flexShrink: 0,
    },
    colDot: { width: 8, height: 8, borderRadius: 4 },
    colTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.2,
    },
    colCount: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    colScroll: {
      flex: 1,
      minHeight: 0,
    },
    colScrollContent: {
      paddingBottom: 4,
      flexGrow: 1,
    },
    card: {
      backgroundColor: isDark ? '#1f2937' : '#ffffff',
      borderRadius: 16,
      padding: 14,
      marginBottom: 10,
      borderWidth: StyleSheet.hairlineWidth * 2,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)',
    },
    labels: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginBottom: 8,
    },
    labelChip: {
      height: 8,
      width: 40,
      borderRadius: 4,
    },
    cardTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      lineHeight: 20,
      letterSpacing: -0.2,
      marginBottom: 4,
    },
    cardDescription: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      lineHeight: 18,
      marginBottom: 10,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
      minHeight: 22,
    },
    metaLeft: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minWidth: 0,
    },
    metaItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    metaText: {
      fontSize: 12,
      fontWeight: '600',
    },
    metaDivider: {
      width: 1,
      height: 12,
      borderRadius: 1,
    },
    priorityWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      flexShrink: 0,
    },
    priorityLabel: {
      fontSize: 12,
      fontWeight: '600',
    },
    cardFooter: {
      marginTop: 10,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      minHeight: 28,
    },
    tasksCenter: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    tasksText: {
      fontSize: 12,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
    },
    footerCounts: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    addCardBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 8,
      marginTop: 4,
      flexShrink: 0,
    },
    addCardText: {
      color: colors.textSecondary,
      fontWeight: '600',
      fontSize: 13,
    },
    newColumnBtn: {
      width: COL_WIDTH,
      height: columnHeight > 0 ? columnHeight : undefined,
      minHeight: columnHeight > 0 ? columnHeight : 220,
      borderRadius: 18,
      borderWidth: 2,
      borderStyle: 'dashed',
      borderColor: isDark ? '#4b5563' : '#d1d5db',
      backgroundColor: isDark ? 'rgba(31, 41, 55, 0.35)' : 'rgba(249, 250, 251, 0.7)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    newColumnInner: {
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
    },
    newColumnText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    colorLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 10,
    },
    colorRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 16,
    },
    colorSwatch: {
      width: 28,
      height: 28,
      borderRadius: 14,
    },
    colorSwatchActive: {
      borderWidth: 3,
      borderColor: '#fff',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.35,
      shadowRadius: 4,
      elevation: 3,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 18,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    input: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.background,
      color: colors.text,
      fontSize: 15,
      marginBottom: 12,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  });
}
