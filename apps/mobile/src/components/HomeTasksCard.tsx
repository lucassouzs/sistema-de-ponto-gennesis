import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, ExternalLink } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { openFavoriteKanbanBoard } from '../lib/openFavoriteKanbanBoard';
import { resolveKanbanDefaultBoard } from '../lib/kanbanDefaultBoard';
import {
  fetchKanbanBoard,
  fetchKanbanBoards,
  type KanbanColumn,
} from '../services/kanban';
import type { RootStackParamList } from '../../App';

type PreviewCard = {
  id: string;
  title: string;
  columnTitle: string;
  columnColor: string;
  endDate: string | null;
};

function isDoneColumn(col: KanbanColumn, index: number, total: number): boolean {
  const t = col.title.trim().toLowerCase();
  if (/(conclu|feito|finaliz|done|complete|arquiv)/i.test(t)) return true;
  return total > 1 && index === total - 1 && /(pronto|ok|entregue)/i.test(t);
}

function formatDue(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export default function HomeTasksCard() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors, isDark);

  const boardsQuery = useQuery({
    queryKey: ['kanban-boards'],
    queryFn: fetchKanbanBoards,
    staleTime: 3 * 60 * 1000,
  });

  const defaultKeyQuery = useQuery({
    queryKey: ['kanban-default-board', user?.id, boardsQuery.data?.map((b) => b.departmentKey).join(',')],
    queryFn: () => resolveKanbanDefaultBoard(user?.id, boardsQuery.data || []),
    enabled: !!boardsQuery.data?.length,
    staleTime: 3 * 60 * 1000,
  });

  const departmentKey = defaultKeyQuery.data ?? undefined;

  const boardQuery = useQuery({
    queryKey: ['kanban-board', departmentKey ?? 'own', 'home'],
    queryFn: () => fetchKanbanBoard(departmentKey),
    enabled: boardsQuery.isSuccess,
    staleTime: 60_000,
  });

  const board = boardQuery.data;
  const boardName =
    board?.department ||
    boardsQuery.data?.find((b) => b.departmentKey === departmentKey)?.department ||
    'Meu quadro';

  const columnStats = useMemo(() => {
    const cols = board?.columns || [];
    return cols.map((col) => ({
      id: col.id,
      title: col.title,
      color: col.color || colors.primary,
      count: col.cards?.length || 0,
    }));
  }, [board?.columns, colors.primary]);

  const totalCards = useMemo(
    () => columnStats.reduce((sum, c) => sum + c.count, 0),
    [columnStats],
  );

  const previewCards = useMemo(() => {
    const cols = board?.columns || [];
    const items: PreviewCard[] = [];
    cols.forEach((col, index) => {
      if (isDoneColumn(col, index, cols.length)) return;
      for (const card of col.cards || []) {
        items.push({
          id: card.id,
          title: card.title,
          columnTitle: col.title,
          columnColor: col.color || colors.primary,
          endDate: card.endDate,
        });
      }
    });
    items.sort((a, b) => {
      const aDue = a.endDate ? new Date(a.endDate).getTime() : Number.POSITIVE_INFINITY;
      const bDue = b.endDate ? new Date(b.endDate).getTime() : Number.POSITIVE_INFINITY;
      if (aDue !== bDue) return aDue - bDue;
      return a.title.localeCompare(b.title, 'pt-BR');
    });
    return items.slice(0, 4);
  }, [board?.columns, colors.primary]);

  const loading = boardsQuery.isLoading || boardQuery.isLoading || defaultKeyQuery.isLoading;

  const openBoard = () => {
    void openFavoriteKanbanBoard(navigation, user?.id, queryClient);
  };

  const openCard = (cardId: string) => {
    navigation.navigate('KanbanCard', {
      cardId,
      departmentKey: board?.departmentKey ?? departmentKey,
    });
  };

  const maxColCount = Math.max(1, ...columnStats.map((c) => c.count));

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}>
            <LayoutGrid size={20} color={colors.primary} strokeWidth={2.2} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>Tasks</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {boardName}
              {totalCards > 0 ? ` · ${totalCards} card${totalCards === 1 ? '' : 's'}` : ''}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={openBoard}
          style={styles.openBtn}
          hitSlop={10}
          accessibilityLabel="Abrir tasks"
        >
          <ExternalLink size={16} color={colors.textSecondary} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !board || columnStats.length === 0 ? (
        <Text style={styles.empty}>Nenhum quadro disponível ainda.</Text>
      ) : (
        <>
          <View style={styles.columnsBlock}>
            {columnStats.map((col) => (
              <View key={col.id} style={styles.columnRow}>
                <View style={styles.columnMeta}>
                  <View style={[styles.columnDot, { backgroundColor: col.color }]} />
                  <Text style={styles.columnTitle} numberOfLines={1}>
                    {col.title}
                  </Text>
                  <Text style={styles.columnCount}>{col.count}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        backgroundColor: col.color,
                        width: `${Math.max(col.count === 0 ? 0 : 8, (col.count / maxColCount) * 100)}%`,
                        opacity: col.count === 0 ? 0.25 : 1,
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>

          {previewCards.length === 0 ? (
            <Text style={[styles.empty, styles.emptyAfterBars]}>
              Nenhum card em andamento neste quadro.
            </Text>
          ) : (
            <View style={styles.list}>
              <Text style={styles.listLabel}>Em andamento</Text>
              {previewCards.map((card) => {
                const due = formatDue(card.endDate);
                return (
                  <TouchableOpacity
                    key={card.id}
                    style={styles.cardRow}
                    onPress={() => openCard(card.id)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[styles.cardAccent, { backgroundColor: card.columnColor }]}
                    />
                    <View style={styles.cardBody}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {card.title}
                      </Text>
                      <View style={styles.cardMeta}>
                        <Text style={styles.cardColumn} numberOfLines={1}>
                          {card.columnTitle}
                        </Text>
                        {due ? <Text style={styles.cardDue}>{due}</Text> : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
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
    emptyAfterBars: {
      marginTop: 12,
    },
    columnsBlock: {
      gap: 8,
    },
    columnRow: {
      gap: 4,
    },
    columnMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    columnDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    columnTitle: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    columnCount: {
      fontSize: 12,
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      color: colors.text,
    },
    barTrack: {
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
    },
    barFill: {
      height: '100%',
      borderRadius: 3,
    },
    list: {
      marginTop: 14,
      gap: 8,
    },
    listLabel: {
      fontSize: 11,
      fontWeight: '600',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
      color: colors.textSecondary,
      marginBottom: 2,
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
    },
    cardAccent: {
      width: 4,
    },
    cardBody: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 3,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    cardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    cardColumn: {
      flex: 1,
      minWidth: 0,
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    cardDue: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.primary,
    },
  });
