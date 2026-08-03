import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  Plus,
  Trash2,
  Send,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import AppHeader from '../../components/AppHeader';
import { useTheme } from '../../context/ThemeContext';
import {
  createChecklistItem,
  createKanbanComment,
  deleteChecklistItem,
  deleteKanbanCard,
  fetchKanbanBoard,
  fetchKanbanCard,
  moveKanbanCard,
  PRIORITY_LABEL,
  type Priority,
  updateChecklistItem,
  updateKanbanCard,
} from '../../services/kanban';
import type { RootStackParamList } from '../../../App';

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical'];

export default function KanbanCardScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'KanbanCard'>>();
  const { cardId, departmentKey } = route.params;
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checklistTitle, setChecklistTitle] = useState('');
  const [comment, setComment] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);

  const cardQuery = useQuery({
    queryKey: ['kanban-card', cardId],
    queryFn: () => fetchKanbanCard(cardId),
  });

  const boardQuery = useQuery({
    queryKey: ['kanban-board', departmentKey ?? 'own'],
    queryFn: () => fetchKanbanBoard(departmentKey),
    enabled: !!departmentKey || moveOpen,
  });

  const card = cardQuery.data;
  const readOnly = boardQuery.data?.canWrite === false;

  useEffect(() => {
    if (card && !dirty) {
      setTitle(card.title);
      setDescription(card.description || '');
    }
  }, [card, dirty]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['kanban-card', cardId] }),
      queryClient.invalidateQueries({
        queryKey: ['kanban-board', departmentKey ?? 'own'],
      }),
    ]);
  };

  const saveMeta = async () => {
    if (!card || readOnly) return;
    setSaving(true);
    try {
      await updateKanbanCard(card.id, {
        title: title.trim() || card.title,
        description: description.trim(),
      });
      setDirty(false);
      await invalidate();
      Toast.show({ type: 'success', text1: 'Card salvo' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao salvar' });
    } finally {
      setSaving(false);
    }
  };

  const setPriority = async (priority: Priority) => {
    if (!card || readOnly) return;
    try {
      await updateKanbanCard(card.id, { priority });
      await invalidate();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha' });
    }
  };

  const toggleItem = async (id: string, isDone: boolean) => {
    try {
      await updateChecklistItem(id, { isDone: !isDone });
      await invalidate();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha' });
    }
  };

  const addChecklist = async () => {
    const t = checklistTitle.trim();
    if (!t || !card) return;
    try {
      await createChecklistItem(card.id, t);
      setChecklistTitle('');
      await invalidate();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha' });
    }
  };

  const removeItem = (id: string) => {
    Alert.alert('Excluir item', 'Remover este item do checklist?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteChecklistItem(id);
            await invalidate();
          } catch (e: any) {
            Toast.show({ type: 'error', text1: e?.message || 'Falha' });
          }
        },
      },
    ]);
  };

  const sendComment = async () => {
    const content = comment.trim();
    if (!content || !card) return;
    try {
      await createKanbanComment(card.id, content);
      setComment('');
      await invalidate();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha' });
    }
  };

  const moveTo = async (columnId: string) => {
    if (!card) return;
    try {
      await moveKanbanCard(card.id, { columnId, position: 0 });
      setMoveOpen(false);
      await invalidate();
      Toast.show({ type: 'success', text1: 'Card movido' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao mover' });
    }
  };

  const removeCard = () => {
    Alert.alert('Excluir card', 'Esta ação não pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteKanbanCard(cardId);
            await queryClient.invalidateQueries({
              queryKey: ['kanban-board', departmentKey ?? 'own'],
            });
            navigation.goBack();
            Toast.show({ type: 'success', text1: 'Card excluído' });
          } catch (e: any) {
            Toast.show({ type: 'error', text1: e?.message || 'Falha' });
          }
        },
      },
    ]);
  };

  if (cardQuery.isLoading && !card) {
    return (
      <View style={styles.safe}>
        <AppHeader showBack title="Card" onBack={() => navigation.goBack()} />
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      </View>
    );
  }

  if (!card) {
    return (
      <View style={styles.safe}>
        <AppHeader showBack title="Card" onBack={() => navigation.goBack()} />
        <Text style={styles.empty}>Card não encontrado.</Text>
      </View>
    );
  }

  return (
    <View style={styles.safe}>
      <AppHeader showBack title="Card" onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <TouchableOpacity
          style={styles.columnChip}
          onPress={() => !readOnly && setMoveOpen(true)}
          disabled={readOnly}
        >
          <View style={[styles.colDot, { backgroundColor: card.columnColor || colors.primary }]} />
          <Text style={styles.columnChipText}>{card.columnTitle || 'Coluna'}</Text>
          {!readOnly ? <ChevronDown size={16} color={colors.textSecondary} /> : null}
        </TouchableOpacity>

        <TextInput
          value={title}
          onChangeText={(t) => {
            setTitle(t);
            setDirty(true);
          }}
          editable={!readOnly}
          style={styles.titleInput}
          multiline
          placeholder="Título"
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={styles.label}>Prioridade</Text>
        <View style={styles.prioRow}>
          {PRIORITIES.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.prioChip, card.priority === p && styles.prioChipActive]}
              onPress={() => void setPriority(p)}
              disabled={readOnly}
            >
              <Text
                style={[styles.prioText, card.priority === p && styles.prioTextActive]}
              >
                {PRIORITY_LABEL[p]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Descrição</Text>
        <TextInput
          value={description}
          onChangeText={(t) => {
            setDescription(t);
            setDirty(true);
          }}
          editable={!readOnly}
          style={styles.descInput}
          multiline
          placeholder="Adicionar descrição..."
          placeholderTextColor={colors.textSecondary}
        />

        {dirty && !readOnly ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={() => void saveMeta()} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Salvar alterações</Text>
            )}
          </TouchableOpacity>
        ) : null}

        <Text style={styles.section}>Checklist</Text>
        {(card.checklistItems || []).map((item) => (
          <View key={item.id} style={styles.checkRow}>
            <TouchableOpacity
              style={[styles.check, item.isDone && styles.checkDone]}
              onPress={() => !readOnly && void toggleItem(item.id, item.isDone)}
              disabled={readOnly}
            >
              {item.isDone ? <Check size={12} color="#fff" strokeWidth={3} /> : null}
            </TouchableOpacity>
            <Text
              style={[styles.checkTitle, item.isDone && styles.checkTitleDone]}
              numberOfLines={2}
            >
              {item.title}
            </Text>
            {!readOnly ? (
              <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={8}>
                <Trash2 size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        {!readOnly ? (
          <View style={styles.addRow}>
            <TextInput
              value={checklistTitle}
              onChangeText={setChecklistTitle}
              placeholder="Novo item..."
              placeholderTextColor={colors.textSecondary}
              style={styles.addInput}
              onSubmitEditing={() => void addChecklist()}
            />
            <TouchableOpacity style={styles.iconBtn} onPress={() => void addChecklist()}>
              <Plus size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={styles.section}>Comentários</Text>
        {(card.commentsList || []).map((c) => (
          <View key={c.id} style={styles.comment}>
            <Text style={styles.commentAuthor}>{c.author?.name || 'Usuário'}</Text>
            <Text style={styles.commentBody}>{c.content}</Text>
          </View>
        ))}
        {!readOnly ? (
          <View style={styles.addRow}>
            <TextInput
              value={comment}
              onChangeText={setComment}
              placeholder="Escrever comentário..."
              placeholderTextColor={colors.textSecondary}
              style={styles.addInput}
              onSubmitEditing={() => void sendComment()}
            />
            <TouchableOpacity style={styles.iconBtn} onPress={() => void sendComment()}>
              <Send size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : null}

        {!readOnly ? (
          <TouchableOpacity style={styles.dangerBtn} onPress={removeCard}>
            <Trash2 size={16} color={colors.error} />
            <Text style={[styles.dangerText, { color: colors.error }]}>Excluir card</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      <Modal visible={moveOpen} transparent animationType="fade" onRequestClose={() => setMoveOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Mover para</Text>
            {(boardQuery.data?.columns ?? []).map((col) => (
              <TouchableOpacity
                key={col.id}
                style={[
                  styles.moveRow,
                  col.id === card.columnId && styles.moveRowActive,
                ]}
                onPress={() => void moveTo(col.id)}
              >
                <View style={[styles.colDot, { backgroundColor: col.color || colors.primary }]} />
                <Text style={styles.moveText}>{col.title}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity onPress={() => setMoveOpen(false)} style={{ marginTop: 12 }}>
              <Text style={{ textAlign: 'center', color: colors.textSecondary }}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getStyles(colors: any, _isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    pad: { padding: 16, paddingBottom: 48 },
    empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 40 },
    columnChip: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      marginBottom: 12,
    },
    columnChipText: { fontSize: 13, fontWeight: '600', color: colors.text },
    colDot: { width: 8, height: 8, borderRadius: 4 },
    titleInput: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 16,
      padding: 0,
    },
    label: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    prioRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
    prioChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.surface,
    },
    prioChipActive: { backgroundColor: colors.primary },
    prioText: { fontSize: 12, fontWeight: '600', color: colors.text },
    prioTextActive: { color: '#fff' },
    descInput: {
      minHeight: 90,
      borderRadius: 12,
      padding: 12,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: 15,
      textAlignVertical: 'top',
      marginBottom: 12,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginBottom: 16,
    },
    primaryBtnText: { color: '#fff', fontWeight: '700' },
    section: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      marginTop: 8,
      marginBottom: 10,
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 10,
      marginBottom: 6,
    },
    check: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkDone: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkTitle: { flex: 1, fontSize: 14, color: colors.text },
    checkTitleDone: {
      textDecorationLine: 'line-through',
      color: colors.textSecondary,
    },
    addRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 12 },
    addInput: {
      flex: 1,
      height: 42,
      borderRadius: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    iconBtn: {
      width: 42,
      height: 42,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    comment: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 10,
      marginBottom: 8,
    },
    commentAuthor: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 2 },
    commentBody: { fontSize: 14, color: colors.textSecondary },
    dangerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 20,
      paddingVertical: 12,
    },
    dangerText: { fontWeight: '600' },
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
    modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text, marginBottom: 12 },
    moveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 10,
    },
    moveRowActive: { backgroundColor: colors.background },
    moveText: { fontSize: 15, fontWeight: '600', color: colors.text },
  });
}
