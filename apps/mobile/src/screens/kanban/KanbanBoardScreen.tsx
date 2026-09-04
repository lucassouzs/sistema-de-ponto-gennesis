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
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Plus,
  MessageSquare,
  Paperclip,
  ListChecks,
  Calendar,
  LayoutGrid,
  X,
} from 'lucide-react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
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
  updateKanbanCard,
  type KanbanBoard,
  type KanbanCard,
  type KanbanColumn,
  type Priority,
} from '../../services/kanban';
import type { RootStackParamList } from '../../../App';

const COL_WIDTH = Math.min(300, Dimensions.get('window').width * 0.78);
/** Mesmo espaço entre colunas, nas laterais e embaixo. */
const BOARD_GAP = 12;
/** Altura do fade inferior (≈ 3.25rem do web). */
const COLUMN_BOTTOM_FADE_H = 52;
/** Verde de conclusão (mesmo do web). */
const COMPLETE_GREEN = '#61BD4F';

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

function parseHexColor(color: string): { r: number; g: number; b: number } | null {
  const raw = color.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const hex = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  const n = parseInt(hex, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixChannel(accent: number, base: number, weight: number) {
  return Math.round(accent * weight + base * (1 - weight));
}

function toHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

/** Fundo da coluna = tint da bolinha (mesmo mix do web). */
function getKanbanColumnBg(color: string | null | undefined, isDark: boolean): string {
  const accent = parseHexColor(color || '#6B7280') || { r: 107, g: 114, b: 128 };
  if (isDark) {
    return toHex(
      mixChannel(accent.r, 31, 0.28),
      mixChannel(accent.g, 41, 0.28),
      mixChannel(accent.b, 55, 0.28),
    );
  }
  return toHex(
    mixChannel(accent.r, 255, 0.22),
    mixChannel(accent.g, 255, 0.22),
    mixChannel(accent.b, 255, 0.22),
  );
}

/**
 * Equivalente mobile da máscara do web:
 * mask-image: linear-gradient(to bottom, black 0%, black calc(100%-3.25rem), transparent 100%)
 * Overlay suave da cor da coluna (sem faixas / sem BlurView).
 */
function ColumnBottomFade({
  color,
  fadeId,
}: {
  color: string;
  fadeId: string;
}) {
  const [width, setWidth] = useState(Math.max(1, COL_WIDTH - 20));

  return (
    <View
      pointerEvents="none"
      style={stylesLocal.colFade}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0) setWidth(w);
      }}
    >
      <Svg width={width} height={COLUMN_BOTTOM_FADE_H}>
        <Defs>
          <SvgLinearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </SvgLinearGradient>
        </Defs>
        <Rect
          x={0}
          y={0}
          width={width}
          height={COLUMN_BOTTOM_FADE_H}
          fill={`url(#${fadeId})`}
        />
      </Svg>
    </View>
  );
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
  readOnly,
  onPress,
  onToggleComplete,
}: {
  card: KanbanCard;
  styles: ReturnType<typeof getStyles>;
  colors: any;
  isDark: boolean;
  readOnly: boolean;
  onPress: () => void;
  onToggleComplete: () => void;
}) {
  const suppressOpenRef = useRef(false);
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
  const isCompleted = Boolean(card.completedAt);
  const titleColor = isCompleted
    ? isDark
      ? '#9ca3af'
      : '#6b7280'
    : colors.text;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => {
        if (suppressOpenRef.current) {
          suppressOpenRef.current = false;
          return;
        }
        onPress();
      }}
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

      <View style={styles.titleRow}>
        <TouchableOpacity
          style={[
            styles.completeBall,
            isCompleted
              ? styles.completeBallDone
              : { borderColor: isDark ? '#6b7280' : '#9ca3af' },
          ]}
          onPress={() => {
            if (readOnly) return;
            suppressOpenRef.current = true;
            onToggleComplete();
          }}
          disabled={readOnly}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={
            isCompleted ? 'Marcar como pendente' : 'Marcar como concluído'
          }
          activeOpacity={readOnly ? 1 : 0.7}
        >
          {isCompleted ? <Check size={12} color="#fff" strokeWidth={3.5} /> : null}
        </TouchableOpacity>
        <Text style={[styles.cardTitle, { color: titleColor }]} numberOfLines={3}>
          {card.title?.trim() ? card.title : 'Sem título'}
        </Text>
      </View>

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

  const boardQueryKey = ['kanban-board', departmentKey ?? 'own'] as const;

  const toggleCardComplete = async (card: KanbanCard) => {
    if (readOnly) return;
    const nextCompletedAt = card.completedAt ? null : new Date().toISOString();
    const previousCompletedAt = card.completedAt ?? null;

    queryClient.setQueryData<KanbanBoard>(boardQueryKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        columns: (old.columns ?? []).map((col) => ({
          ...col,
          cards: (col.cards ?? []).map((c) =>
            c.id === card.id ? { ...c, completedAt: nextCompletedAt } : c,
          ),
        })),
      };
    });

    try {
      const updated = await updateKanbanCard(card.id, { completedAt: nextCompletedAt });
      queryClient.setQueryData<KanbanBoard>(boardQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: (old.columns ?? []).map((col) => ({
            ...col,
            cards: (col.cards ?? []).map((c) =>
              c.id === card.id
                ? { ...c, completedAt: updated.completedAt ?? nextCompletedAt }
                : c,
            ),
          })),
        };
      });
    } catch {
      queryClient.setQueryData<KanbanBoard>(boardQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          columns: (old.columns ?? []).map((col) => ({
            ...col,
            cards: (col.cards ?? []).map((c) =>
              c.id === card.id ? { ...c, completedAt: previousCompletedAt } : c,
            ),
          })),
        };
      });
      Toast.show({ type: 'error', text1: 'Não foi possível atualizar o status do card' });
    }
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
                onToggleComplete={toggleCardComplete}
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
  onToggleComplete,
  onAdd,
}: {
  column: KanbanColumn;
  styles: ReturnType<typeof getStyles>;
  colors: any;
  isDark: boolean;
  readOnly: boolean;
  onOpenCard: (c: KanbanCard) => void;
  onToggleComplete: (c: KanbanCard) => void;
  onAdd: () => void;
}) {
  const columnBg = getKanbanColumnBg(column.color, isDark);
  const cards = Array.isArray(column.cards) ? column.cards : [];
  const [showBottomFade, setShowBottomFade] = useState(false);
  const scrollH = useRef(0);
  const contentH = useRef(0);
  const scrollY = useRef(0);

  const updateBottomFade = useCallback(() => {
    const canScroll = contentH.current > scrollH.current + 2;
    const atBottom = scrollY.current + scrollH.current >= contentH.current - 6;
    setShowBottomFade(canScroll && !atBottom);
  }, []);

  useEffect(() => {
    updateBottomFade();
  }, [cards.length, updateBottomFade]);

  return (
    <View style={[styles.column, { backgroundColor: columnBg }]}>
      <View style={styles.colHeader}>
        <View style={[styles.colDot, { backgroundColor: column.color || colors.primary }]} />
        <Text style={styles.colTitle} numberOfLines={1}>
          {column.title}
        </Text>
        <Text style={styles.colCount}>{cards.length}</Text>
      </View>

      <View style={styles.colScrollWrap}>
        <ScrollView
          style={styles.colScroll}
          nestedScrollEnabled
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.colScrollContent}
          onLayout={(e) => {
            scrollH.current = e.nativeEvent.layout.height;
            updateBottomFade();
          }}
          onContentSizeChange={(_w, h) => {
            contentH.current = h;
            updateBottomFade();
          }}
          onScroll={(e) => {
            scrollY.current = e.nativeEvent.contentOffset.y;
            updateBottomFade();
          }}
          scrollEventThrottle={16}
        >
          {cards.map((card) => (
            <BoardCard
              key={card.id}
              card={card}
              styles={styles}
              colors={colors}
              isDark={isDark}
              readOnly={readOnly}
              onPress={() => onOpenCard(card)}
              onToggleComplete={() => onToggleComplete(card)}
            />
          ))}
        </ScrollView>
        {showBottomFade ? (
          <ColumnBottomFade color={columnBg} fadeId={`kanban-fade-${column.id}`} />
        ) : null}
      </View>

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
  colFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: COLUMN_BOTTOM_FADE_H,
    overflow: 'hidden',
  },
});

function getStyles(colors: any, isDark: boolean, columnHeight: number) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.screenRoot },
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
      borderRadius: 18,
      padding: 10,
      flexDirection: 'column',
      overflow: 'hidden',
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
    colScrollWrap: {
      flex: 1,
      minHeight: 0,
      position: 'relative',
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
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 4,
    },
    completeBall: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 1,
      flexShrink: 0,
      backgroundColor: 'transparent',
    },
    completeBallDone: {
      borderColor: COMPLETE_GREEN,
      backgroundColor: COMPLETE_GREEN,
    },
    cardTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      lineHeight: 20,
      letterSpacing: -0.2,
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
