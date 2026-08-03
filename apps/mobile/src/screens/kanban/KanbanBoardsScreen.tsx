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
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LayoutGrid, Plus, Star, X } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import AppHeader from '../../components/AppHeader';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import {
  resolveKanbanDefaultBoard,
  saveKanbanDefaultBoard,
} from '../../lib/kanbanDefaultBoard';
import {
  createKanbanBoard,
  fetchKanbanBoards,
  type KanbanBoardSummary,
} from '../../services/kanban';
import type { RootStackParamList } from '../../../App';

export default function KanbanBoardsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const { isAdministrator } = usePermissions();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [defaultKey, setDefaultKey] = useState<string | null>(null);
  const canCreateBoard = !isAdministrator;

  const boardsQuery = useQuery({
    queryKey: ['kanban-boards'],
    queryFn: fetchKanbanBoards,
  });

  const boards = boardsQuery.data ?? [];

  useEffect(() => {
    if (!boards.length) {
      setDefaultKey(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const key = await resolveKanbanDefaultBoard(user?.id, boards);
      if (!cancelled) setDefaultKey(key);
    })();
    return () => {
      cancelled = true;
    };
  }, [boards, user?.id]);

  const openBoard = (board: KanbanBoardSummary) => {
    navigation.navigate('KanbanBoard', { departmentKey: board.departmentKey });
  };

  const setAsDefault = async (board: KanbanBoardSummary) => {
    if (!user?.id) return;
    await saveKanbanDefaultBoard(user.id, board.departmentKey);
    setDefaultKey(board.departmentKey);
    Toast.show({ type: 'success', text1: 'Quadro favorito definido' });
  };

  const create = async () => {
    if (!canCreateBoard) {
      Toast.show({
        type: 'error',
        text1: 'Administradores acessam apenas quadros de setor',
      });
      return;
    }
    const title = name.trim();
    if (!title) {
      Toast.show({ type: 'error', text1: 'Informe o nome do quadro' });
      return;
    }
    setSaving(true);
    try {
      const board = await createKanbanBoard(title);
      setCreateOpen(false);
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['kanban-boards'] });
      Toast.show({ type: 'success', text1: 'Quadro criado' });
      navigation.navigate('KanbanBoard', { departmentKey: board.departmentKey });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao criar' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.safe}>
      <AppHeader showBack title="Quadros" onBack={() => navigation.goBack()} />

      <View style={styles.toolbar}>
        <Text style={styles.subtitle}>Seus quadros</Text>
        {canCreateBoard ? (
          <TouchableOpacity style={styles.addBtn} onPress={() => setCreateOpen(true)}>
            <Plus size={18} color="#fff" strokeWidth={2.4} />
            <Text style={styles.addBtnText}>Novo</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={boardsQuery.isRefetching}
            onRefresh={() => void boardsQuery.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {boardsQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : boards.length === 0 ? (
          <Text style={styles.empty}>
            {canCreateBoard
              ? 'Nenhum quadro disponível.'
              : 'Nenhum quadro de setor disponível.'}
          </Text>
        ) : (
          boards.map((board) => {
            const isFavorite = defaultKey === board.departmentKey;
            return (
              <TouchableOpacity
                key={board.id || board.departmentKey}
                style={styles.card}
                onPress={() => openBoard(board)}
                activeOpacity={0.75}
              >
                <View style={styles.cardIcon}>
                  <LayoutGrid size={20} color={colors.primary} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {board.department}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {board.columnCount} coluna{board.columnCount === 1 ? '' : 's'}
                    {board.isOwnDepartment ? ' · Seu setor' : ''}
                    {board.sharedWithMe ? ' · Compartilhado' : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => void setAsDefault(board)}
                  hitSlop={10}
                  accessibilityLabel={
                    isFavorite ? 'Quadro favorito' : 'Definir como favorito'
                  }
                >
                  <Star
                    size={18}
                    color={isFavorite ? colors.warning : colors.textSecondary}
                    fill={isFavorite ? colors.warning : 'transparent'}
                    strokeWidth={2}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {canCreateBoard ? (
        <Modal
          visible={createOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setCreateOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Novo quadro</Text>
                <TouchableOpacity onPress={() => setCreateOpen(false)}>
                  <X size={22} color={colors.text} />
                </TouchableOpacity>
              </View>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="Nome do quadro"
                placeholderTextColor={colors.textSecondary}
                style={styles.input}
                autoFocus
              />
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => void create()}
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
      ) : null}
    </View>
  );
}

function getStyles(colors: any, _isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
    },
    subtitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
    list: { padding: 16, paddingBottom: 40, gap: 10 },
    empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 40 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 10,
    },
    cardIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.iconBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
    cardMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
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
