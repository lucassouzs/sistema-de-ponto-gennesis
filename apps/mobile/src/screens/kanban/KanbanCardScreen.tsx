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
  Platform,
  Linking,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import {
  Check,
  ChevronDown,
  Plus,
  Trash2,
  Send,
  Tag,
  Calendar,
  Clock,
  Paperclip,
  Link as LinkIcon,
  ExternalLink,
  ListChecks,
  X,
} from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import AppHeader from '../../components/AppHeader';
import { useTheme } from '../../context/ThemeContext';
import {
  addKanbanLinkAttachment,
  createChecklistItem,
  createKanbanComment,
  DEFAULT_KANBAN_LABEL_PRESETS,
  deleteChecklistItem,
  deleteKanbanAttachment,
  deleteKanbanCard,
  fetchKanbanBoard,
  fetchKanbanCard,
  isKanbanLinkAttachment,
  moveKanbanCard,
  PRIORITY_LABEL,
  type KanbanCardLabel,
  type Priority,
  updateChecklistItem,
  updateKanbanCard,
  uploadKanbanAttachments,
} from '../../services/kanban';
import type { RootStackParamList } from '../../../App';

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'critical'];

function labelTextColor(background: string): string {
  const hex = background.replace('#', '').trim();
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  if (full.length !== 6) return '#FFFFFF';
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return '#FFFFFF';
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#1F2937' : '#FFFFFF';
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function splitDateTime(value: string | null | undefined): { date: string; time: string } {
  if (!value) return { date: '', time: '09:00' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value, time: '09:00' };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return { date: value.slice(0, 10), time: '09:00' };
  }
  return {
    date: toYmd(d),
    time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
  };
}

function combineDateTime(date: string, time: string): string {
  if (!date) return '';
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : '09:00';
  return `${date}T${t}:00`;
}

function formatDisplayDate(iso: string | null | undefined): string {
  const { date } = splitDateTime(iso);
  if (!date) return 'Definir data';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatDisplayTime(iso: string | null | undefined): string {
  if (!iso) return '09:00';
  return splitDateTime(iso).time;
}

function parseLocalDateTime(iso: string | null | undefined): Date {
  const { date, time } = splitDateTime(iso);
  if (!date) return new Date();
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

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
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [datePicker, setDatePicker] = useState<null | {
    field: 'start' | 'end';
    mode: 'date' | 'time';
  }>(null);
  const [checklistEnabled, setChecklistEnabled] = useState(false);
  const [showDatesPanel, setShowDatesPanel] = useState(false);
  const [showAttachmentsPanel, setShowAttachmentsPanel] = useState(false);

  const cardQuery = useQuery({
    queryKey: ['kanban-card', cardId],
    queryFn: () => fetchKanbanCard(cardId),
  });

  const boardQuery = useQuery({
    queryKey: ['kanban-board', departmentKey ?? 'own'],
    queryFn: () => fetchKanbanBoard(departmentKey),
  });

  const card = cardQuery.data;
  const readOnly = boardQuery.data?.canWrite === false;
  const labelPresets =
    boardQuery.data?.labelPresets?.length
      ? boardQuery.data.labelPresets
      : DEFAULT_KANBAN_LABEL_PRESETS;
  const labels = card?.labels ?? [];
  const attachments = card?.attachmentsList ?? [];

  useEffect(() => {
    if (card && !dirty) {
      setTitle(card.title);
      setDescription(card.description || '');
    }
  }, [card, dirty]);

  useEffect(() => {
    if (!card) return;
    setChecklistEnabled(Boolean(card.checklistEnabled) || (card.totalTasks ?? 0) > 0);
    if (card.startDate || card.endDate) setShowDatesPanel(true);
    if ((card.attachmentsList ?? []).length > 0) setShowAttachmentsPanel(true);
  }, [card?.id, card?.checklistEnabled, card?.totalTasks, card?.startDate, card?.endDate, card?.attachmentsList?.length]);

  const hasLabels = labels.length > 0;
  const hasDates = !!(card?.startDate || card?.endDate);
  const hasAttachments = attachments.length > 0;
  const showChecklist = checklistEnabled;
  const showDates = showDatesPanel || hasDates;
  const showAttachments = showAttachmentsPanel || hasAttachments;

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['kanban-card', cardId] }),
      queryClient.invalidateQueries({
        queryKey: ['kanban-board', departmentKey ?? 'own'],
      }),
    ]);
  };

  const saveMeta = async (opts?: { silent?: boolean }) => {
    if (!card || readOnly || !dirty) return;
    setSaving(true);
    try {
      await updateKanbanCard(card.id, {
        title: title.trim() || card.title,
        description: description.trim(),
      });
      setDirty(false);
      await invalidate();
      if (!opts?.silent) {
        Toast.show({ type: 'success', text1: 'Card salvo' });
      }
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

  const toggleCardComplete = async () => {
    if (!card || readOnly) return;
    const nextCompletedAt = card.completedAt ? null : new Date().toISOString();
    const previousCompletedAt = card.completedAt ?? null;

    queryClient.setQueryData(['kanban-card', cardId], (old: any) =>
      old ? { ...old, completedAt: nextCompletedAt } : old,
    );
    queryClient.setQueryData(['kanban-board', departmentKey ?? 'own'], (old: any) => {
      if (!old) return old;
      return {
        ...old,
        columns: old.columns.map((col: any) => ({
          ...col,
          cards: col.cards.map((c: any) =>
            c.id === card.id ? { ...c, completedAt: nextCompletedAt } : c,
          ),
        })),
      };
    });

    try {
      const updated = await updateKanbanCard(card.id, { completedAt: nextCompletedAt });
      const resolved = updated.completedAt ?? nextCompletedAt;
      queryClient.setQueryData(['kanban-card', cardId], (old: any) =>
        old ? { ...old, completedAt: resolved } : old,
      );
      queryClient.setQueryData(['kanban-board', departmentKey ?? 'own'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col: any) => ({
            ...col,
            cards: col.cards.map((c: any) =>
              c.id === card.id ? { ...c, completedAt: resolved } : c,
            ),
          })),
        };
      });
    } catch {
      queryClient.setQueryData(['kanban-card', cardId], (old: any) =>
        old ? { ...old, completedAt: previousCompletedAt } : old,
      );
      queryClient.setQueryData(['kanban-board', departmentKey ?? 'own'], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          columns: old.columns.map((col: any) => ({
            ...col,
            cards: col.cards.map((c: any) =>
              c.id === card.id ? { ...c, completedAt: previousCompletedAt } : c,
            ),
          })),
        };
      });
      Toast.show({ type: 'error', text1: 'Não foi possível atualizar o status do card' });
    }
  };

  const toggleChecklist = async () => {
    if (readOnly) return;
    const next = !checklistEnabled;
    setChecklistEnabled(next);
    if (!card) return;
    if (next) return; // UI only — backend liga ao criar a 1ª tarefa
    try {
      await updateKanbanCard(card.id, { checklistEnabled: false });
      await invalidate();
    } catch (e: any) {
      setChecklistEnabled(true);
      Toast.show({ type: 'error', text1: e?.message || 'Falha' });
    }
  };

  const clearAllLabels = async () => {
    if (!card || readOnly || labels.length === 0) return;
    try {
      await updateKanbanCard(card.id, { labels: [] });
      await invalidate();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha' });
    }
  };

  const toggleLabel = async (preset: { color: string; name: string }) => {
    if (!card || readOnly) return;
    const exists = labels.some(
      (l) => l.color.toLowerCase() === preset.color.toLowerCase(),
    );
    const next: KanbanCardLabel[] = exists
      ? labels.filter((l) => l.color.toLowerCase() !== preset.color.toLowerCase())
      : [...labels, { color: preset.color, text: preset.name }];
    try {
      await updateKanbanCard(card.id, { labels: next });
      await invalidate();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao atualizar etiquetas' });
    }
  };

  const saveDate = async (field: 'start' | 'end', value: string | null) => {
    if (!card || readOnly) return;
    try {
      await updateKanbanCard(card.id, {
        startDate: field === 'start' ? value : undefined,
        endDate: field === 'end' ? value : undefined,
      });
      await invalidate();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao salvar data' });
    }
  };

  const openDatePicker = (field: 'start' | 'end', mode: 'date' | 'time') => {
    if (readOnly) return;
    const current = field === 'start' ? card?.startDate : card?.endDate;
    if (mode === 'time' && !current) {
      // Sem data ainda: escolhe data primeiro
      setDatePicker({ field, mode: 'date' });
      return;
    }
    setDatePicker({ field, mode });
  };

  const onPickDate = (_event: any, selected?: Date) => {
    const picker = datePicker;
    if (Platform.OS === 'android') setDatePicker(null);
    if (!picker || !selected) {
      if (Platform.OS === 'ios' && !selected) setDatePicker(null);
      return;
    }

    const current =
      picker.field === 'start' ? card?.startDate ?? null : card?.endDate ?? null;
    const { date: curDate, time: curTime } = splitDateTime(current);

    if (picker.mode === 'date') {
      const nextDate = toYmd(selected);
      const next = combineDateTime(nextDate, curTime || '09:00');
      void saveDate(picker.field, next);
      if (Platform.OS === 'ios') setDatePicker(null);
      // No Android, após escolher a data, abrir hora se ainda não tinha data
      if (Platform.OS === 'android' && !current) {
        setTimeout(() => setDatePicker({ field: picker.field, mode: 'time' }), 250);
      }
      return;
    }

    const hh = String(selected.getHours()).padStart(2, '0');
    const mm = String(selected.getMinutes()).padStart(2, '0');
    const baseDate = curDate || toYmd(new Date());
    void saveDate(picker.field, combineDateTime(baseDate, `${hh}:${mm}`));
    if (Platform.OS === 'ios') setDatePicker(null);
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

  const pickAttachment = async () => {
    if (!card || readOnly) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da galeria para anexar arquivos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });
    if (result.canceled || !result.assets?.length) return;

    setUploading(true);
    try {
      const files = result.assets.map((asset, idx) => {
        const uri = asset.uri;
        const name =
          asset.fileName ||
          `anexo-${Date.now()}-${idx}.${(asset.mimeType || 'image/jpeg').split('/')[1] || 'jpg'}`;
        const type = asset.mimeType || 'image/jpeg';
        return { uri, name, type };
      });
      await uploadKanbanAttachments(card.id, files);
      await invalidate();
      Toast.show({ type: 'success', text1: 'Anexo enviado' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao anexar' });
    } finally {
      setUploading(false);
    }
  };

  const saveLink = async () => {
    if (!card || readOnly) return;
    const url = linkUrl.trim();
    if (!url) {
      Toast.show({ type: 'error', text1: 'Informe a URL' });
      return;
    }
    try {
      await addKanbanLinkAttachment(card.id, {
        url,
        displayName: linkName.trim() || undefined,
      });
      setLinkOpen(false);
      setLinkUrl('');
      setLinkName('');
      await invalidate();
      Toast.show({ type: 'success', text1: 'Link adicionado' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao adicionar link' });
    }
  };

  const removeAttachment = (id: string, name: string) => {
    Alert.alert('Remover anexo', `Remover "${name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteKanbanAttachment(id);
            await invalidate();
          } catch (e: any) {
            Toast.show({ type: 'error', text1: e?.message || 'Falha' });
          }
        },
      },
    ]);
  };

  const openAttachment = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Toast.show({ type: 'error', text1: 'Não foi possível abrir o anexo' });
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

  const checklistItems = card.checklistItems || [];
  const comments = card.commentsList || [];
  const doneTasks = checklistItems.filter((i) => i.isDone).length;
  const isCardCompleted = Boolean(card.completedAt);
  const pickerValue = datePicker
    ? parseLocalDateTime(
        datePicker.field === 'start' ? card.startDate : card.endDate,
      )
    : new Date();

  return (
    <View style={styles.safe}>
      <AppHeader
        showBack
        title={card.columnTitle || 'Card'}
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <View style={styles.metaRow}>
          <TouchableOpacity
            style={styles.columnChip}
            onPress={() => !readOnly && setMoveOpen(true)}
            disabled={readOnly}
          >
            <View style={[styles.colDot, { backgroundColor: card.columnColor || colors.primary }]} />
            <Text style={styles.columnChipText} numberOfLines={1}>
              {card.columnTitle || 'Coluna'}
            </Text>
            {!readOnly ? <ChevronDown size={14} color={colors.textSecondary} /> : null}
          </TouchableOpacity>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.prioRow}
            style={styles.prioScroll}
          >
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
          </ScrollView>
        </View>

        <View style={styles.titleRow}>
          <TouchableOpacity
            style={[
              styles.completeBall,
              isCardCompleted
                ? styles.completeBallDone
                : { borderColor: isDark ? '#6b7280' : '#9ca3af' },
            ]}
            onPress={() => void toggleCardComplete()}
            disabled={readOnly}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={
              isCardCompleted ? 'Marcar como pendente' : 'Marcar como concluído'
            }
            activeOpacity={readOnly ? 1 : 0.7}
          >
            {isCardCompleted ? <Check size={12} color="#fff" strokeWidth={3.5} /> : null}
          </TouchableOpacity>
          <TextInput
            value={title}
            onChangeText={(t) => {
              setTitle(t);
              setDirty(true);
            }}
            onBlur={() => void saveMeta({ silent: true })}
            editable={!readOnly}
            style={[
              styles.titleInput,
              isCardCompleted && styles.titleInputCompleted,
            ]}
            multiline
            placeholder="Título do card"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {saving ? (
          <Text style={styles.savingHint}>Salvando…</Text>
        ) : dirty && !readOnly ? (
          <Text style={styles.savingHint}>Alterações pendentes</Text>
        ) : null}

        <View style={styles.actionsGrid}>
          <ActionButton
            label="Etiquetas"
            icon={Tag}
            active={hasLabels}
            colors={colors}
            disabled={readOnly}
            onPress={() => {
              if (readOnly) return;
              if (!hasLabels) {
                setLabelsOpen(true);
                return;
              }
              Alert.alert('Etiquetas', 'O que deseja fazer?', [
                { text: 'Editar', onPress: () => setLabelsOpen(true) },
                {
                  text: 'Remover todas',
                  style: 'destructive',
                  onPress: () => void clearAllLabels(),
                },
                { text: 'Cancelar', style: 'cancel' },
              ]);
            }}
          />
          <ActionButton
            label="Datas"
            icon={Clock}
            active={hasDates || showDatesPanel}
            colors={colors}
            disabled={readOnly}
            onPress={() => {
              if (readOnly) return;
              setShowDatesPanel((v) => !v);
            }}
          />
          <ActionButton
            label="Tarefas"
            icon={ListChecks}
            active={checklistEnabled}
            colors={colors}
            disabled={readOnly}
            onPress={() => void toggleChecklist()}
          />
          <ActionButton
            label="Anexos"
            icon={Paperclip}
            active={hasAttachments || showAttachmentsPanel}
            colors={colors}
            disabled={readOnly}
            onPress={() => {
              if (readOnly) return;
              setShowAttachmentsPanel((v) => !v);
            }}
          />
        </View>

        {hasLabels ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Etiquetas</Text>
            <View style={styles.labelsRow}>
              {labels.map((l) => (
                <TouchableOpacity
                  key={`${l.color}-${l.text}`}
                  style={[styles.labelChip, { backgroundColor: l.color }]}
                  onPress={() => !readOnly && setLabelsOpen(true)}
                  disabled={readOnly}
                >
                  <Text style={styles.labelChipText} numberOfLines={1}>
                    {l.text || 'Etiqueta'}
                  </Text>
                </TouchableOpacity>
              ))}
              {!readOnly ? (
                <TouchableOpacity
                  style={styles.labelAdd}
                  onPress={() => setLabelsOpen(true)}
                >
                  <Plus size={14} color={colors.primary} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}

        {showDates ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>Datas</Text>

            <View style={styles.dateField}>
              <View style={styles.dateFieldHead}>
                <Text style={styles.dateFieldTitle}>Início</Text>
                {card.startDate && !readOnly ? (
                  <TouchableOpacity onPress={() => void saveDate('start', null)} hitSlop={8}>
                    <X size={15} color={colors.textSecondary} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.dateParts}>
                <TouchableOpacity
                  style={styles.datePartBtn}
                  disabled={readOnly}
                  onPress={() => openDatePicker('start', 'date')}
                >
                  <Calendar size={15} color={colors.textSecondary} />
                  <Text style={styles.datePartText} numberOfLines={1}>
                    {card.startDate ? formatDisplayDate(card.startDate) : 'Definir data'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.datePartBtn, styles.datePartTime]}
                  disabled={readOnly}
                  onPress={() => openDatePicker('start', 'time')}
                >
                  <Clock size={15} color={colors.textSecondary} />
                  <Text style={styles.datePartText}>
                    {card.startDate ? formatDisplayTime(card.startDate) : '--:--'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.dateField, { marginTop: 12 }]}>
              <View style={styles.dateFieldHead}>
                <Text style={styles.dateFieldTitle}>Entrega</Text>
                {card.endDate && !readOnly ? (
                  <TouchableOpacity onPress={() => void saveDate('end', null)} hitSlop={8}>
                    <X size={15} color={colors.textSecondary} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={styles.dateParts}>
                <TouchableOpacity
                  style={styles.datePartBtn}
                  disabled={readOnly}
                  onPress={() => openDatePicker('end', 'date')}
                >
                  <Calendar size={15} color={colors.textSecondary} />
                  <Text style={styles.datePartText} numberOfLines={1}>
                    {card.endDate ? formatDisplayDate(card.endDate) : 'Definir data'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.datePartBtn, styles.datePartTime]}
                  disabled={readOnly}
                  onPress={() => openDatePicker('end', 'time')}
                >
                  <Clock size={15} color={colors.textSecondary} />
                  <Text style={styles.datePartText}>
                    {card.endDate ? formatDisplayTime(card.endDate) : '--:--'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.block}>
          <Text style={styles.blockLabel}>Descrição</Text>
          <TextInput
            value={description}
            onChangeText={(t) => {
              setDescription(t);
              setDirty(true);
            }}
            onBlur={() => void saveMeta({ silent: true })}
            editable={!readOnly}
            style={styles.descInput}
            multiline
            placeholder="Adicionar descrição..."
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {showChecklist ? (
          <View style={styles.block}>
            <View style={styles.blockLabelRow}>
              <Text style={[styles.blockLabel, styles.blockLabelInRow]}>Tarefas</Text>
              {checklistItems.length > 0 ? (
                <Text style={styles.blockCount}>
                  {doneTasks}/{checklistItems.length}
                </Text>
              ) : null}
            </View>
            {checklistItems.map((item) => (
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
                  placeholder="Adicionar tarefa..."
                  placeholderTextColor={colors.textSecondary}
                  style={styles.addInput}
                  onSubmitEditing={() => void addChecklist()}
                />
                <TouchableOpacity style={styles.iconBtn} onPress={() => void addChecklist()}>
                  <Plus size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        {showAttachments ? (
          <View style={styles.block}>
            <View style={styles.blockLabelRow}>
              <Text style={[styles.blockLabel, styles.blockLabelInRow]}>Anexos</Text>
              {attachments.length > 0 ? (
                <Text style={styles.blockCount}>{attachments.length}</Text>
              ) : null}
              {!readOnly ? (
                <View style={styles.attachActions}>
                  <TouchableOpacity
                    style={styles.sectionAction}
                    onPress={() => void pickAttachment()}
                    disabled={uploading}
                  >
                    <Text style={styles.sectionActionText}>
                      {uploading ? '…' : 'Arquivo'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.sectionAction}
                    onPress={() => setLinkOpen(true)}
                  >
                    <Text style={styles.sectionActionText}>Link</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
            {attachments.length === 0 ? (
              <Text style={styles.hint}>Nenhum anexo ainda</Text>
            ) : (
              attachments.map((att) => (
                <View key={att.id} style={styles.attachRow}>
                  <TouchableOpacity
                    style={styles.attachMain}
                    onPress={() => void openAttachment(att.fileUrl)}
                  >
                    {isKanbanLinkAttachment(att.mimeType) ? (
                      <LinkIcon size={16} color={colors.primary} />
                    ) : (
                      <Paperclip size={16} color={colors.primary} />
                    )}
                    <Text style={styles.attachName} numberOfLines={1}>
                      {att.fileName}
                    </Text>
                    <ExternalLink size={14} color={colors.textSecondary} />
                  </TouchableOpacity>
                  {!readOnly ? (
                    <TouchableOpacity
                      onPress={() => removeAttachment(att.id, att.fileName)}
                      hitSlop={8}
                    >
                      <Trash2 size={14} color={colors.textSecondary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              ))
            )}
          </View>
        ) : null}

        <View style={styles.block}>
          <View style={styles.blockLabelRow}>
            <Text style={[styles.blockLabel, styles.blockLabelInRow]}>Comentários</Text>
            {comments.length > 0 ? (
              <Text style={styles.blockCount}>{comments.length}</Text>
            ) : null}
          </View>
          {comments.length === 0 ? (
            <Text style={styles.hint}>Nenhum comentário</Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={styles.comment}>
                <Text style={styles.commentAuthor}>{c.author?.name || 'Usuário'}</Text>
                <Text style={styles.commentBody}>{c.content}</Text>
              </View>
            ))
          )}
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
        </View>

        {!readOnly ? (
          <TouchableOpacity style={styles.dangerBtn} onPress={removeCard}>
            <Trash2 size={16} color={colors.error} />
            <Text style={[styles.dangerText, { color: colors.error }]}>Excluir card</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {datePicker ? (
        <DateTimePicker
          value={pickerValue}
          mode={datePicker.mode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onPickDate}
        />
      ) : null}

      <Modal
        visible={labelsOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setLabelsOpen(false)}
      >
        <View style={styles.sheetOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setLabelsOpen(false)}
          />
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Etiquetas</Text>
                <Text style={styles.sheetSubtitle}>
                  Toque para adicionar ou remover do card
                </Text>
              </View>
              <TouchableOpacity
                style={styles.sheetClose}
                onPress={() => setLabelsOpen(false)}
                hitSlop={8}
              >
                <X size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.sheetScroll}
              contentContainerStyle={styles.sheetScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {labelPresets.map((preset) => {
                const active = labels.some(
                  (l) => l.color.toLowerCase() === preset.color.toLowerCase(),
                );
                const fg = labelTextColor(preset.color);
                return (
                  <TouchableOpacity
                    key={preset.color}
                    activeOpacity={0.85}
                    style={[styles.labelOption, { backgroundColor: preset.color }]}
                    onPress={() => void toggleLabel(preset)}
                  >
                    <Text
                      style={[styles.labelOptionText, { color: fg }]}
                      numberOfLines={1}
                    >
                      {preset.name}
                    </Text>
                    <View
                      style={[
                        styles.labelOptionCheck,
                        {
                          borderColor: fg,
                          backgroundColor: active ? fg : 'transparent',
                        },
                      ]}
                    >
                      {active ? (
                        <Check
                          size={12}
                          color={preset.color}
                          strokeWidth={3}
                        />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {labels.length > 0 ? (
              <TouchableOpacity
                style={styles.sheetSecondaryBtn}
                onPress={() => void clearAllLabels()}
              >
                <Text style={[styles.sheetSecondaryText, { color: colors.error }]}>
                  Remover todas
                </Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setLabelsOpen(false)}
            >
              <Text style={styles.primaryBtnText}>Concluído</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={linkOpen} transparent animationType="fade" onRequestClose={() => setLinkOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Adicionar link</Text>
              <TouchableOpacity onPress={() => setLinkOpen(false)}>
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <TextInput
              value={linkUrl}
              onChangeText={setLinkUrl}
              placeholder="https://..."
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="url"
              style={styles.modalInput}
            />
            <TextInput
              value={linkName}
              onChangeText={setLinkName}
              placeholder="Nome (opcional)"
              placeholderTextColor={colors.textSecondary}
              style={styles.modalInput}
            />
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void saveLink()}>
              <Text style={styles.primaryBtnText}>Adicionar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={moveOpen} transparent animationType="fade" onRequestClose={() => setMoveOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mover para</Text>
              <TouchableOpacity onPress={() => setMoveOpen(false)}>
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
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
                {col.id === card.columnId ? (
                  <Check size={16} color={colors.primary} strokeWidth={3} />
                ) : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ActionButton({
  label,
  icon: Icon,
  active,
  colors,
  disabled,
  onPress,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  active?: boolean;
  colors: any;
  disabled?: boolean;
  onPress: () => void;
}) {
  const border = active ? colors.primary : colors.border;
  const fg = active ? colors.primary : colors.text;
  const bg = active ? `${colors.primary}12` : colors.surface;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={{
        flexBasis: '47%',
        flexGrow: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: bg,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? `${colors.primary}18` : colors.background,
        }}
      >
        <Icon size={16} color={active ? colors.primary : colors.textSecondary} strokeWidth={2.2} />
      </View>
      <Text style={{ fontSize: 13, fontWeight: '700', color: fg }}>{label}</Text>
    </TouchableOpacity>
  );
}

function getStyles(colors: any, _isDark: boolean) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.screenRoot },
    pad: { padding: 16, paddingBottom: 56, gap: 0 },
    empty: { textAlign: 'center', color: colors.textSecondary, marginTop: 40 },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
    },
    columnChip: {
      flexShrink: 1,
      maxWidth: '42%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 10,
    },
    columnChipText: { flexShrink: 1, fontSize: 12, fontWeight: '700', color: colors.text },
    colDot: { width: 8, height: 8, borderRadius: 4 },
    prioScroll: { flex: 1 },
    prioRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    prioChip: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    prioChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    prioText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
    prioTextActive: { color: '#fff' },
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
      marginTop: 5,
      flexShrink: 0,
      backgroundColor: 'transparent',
    },
    completeBallDone: {
      borderColor: '#61BD4F',
      backgroundColor: '#61BD4F',
    },
    titleInput: {
      flex: 1,
      fontSize: 24,
      fontWeight: '800',
      color: colors.text,
      padding: 0,
      lineHeight: 30,
    },
    titleInputCompleted: {
      color: colors.textSecondary,
    },
    savingHint: {
      fontSize: 11,
      color: colors.textSecondary,
      marginBottom: 10,
    },
    actionsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 14,
      marginTop: 4,
    },
    block: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 12,
    },
    blockLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 8,
    },
    blockLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    blockLabelInRow: {
      flex: 1,
      marginBottom: 0,
    },
    blockCount: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      backgroundColor: colors.background,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 0,
    },
    sectionAction: {
      paddingHorizontal: 4,
      paddingVertical: 2,
    },
    sectionActionText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    attachActions: { flexDirection: 'row', gap: 10, marginLeft: 'auto' },
    hint: {
      color: colors.textSecondary,
      fontSize: 13,
      marginBottom: 4,
    },
    labelsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      alignItems: 'center',
    },
    labelChip: {
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
      maxWidth: '100%',
    },
    labelChipText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
    labelAdd: {
      width: 28,
      height: 28,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateField: {},
    dateFieldHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    dateFieldTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    dateParts: {
      flexDirection: 'row',
      gap: 8,
    },
    datePartBtn: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    datePartTime: {
      flex: 0,
      flexGrow: 0,
      flexBasis: 108,
      width: 108,
    },
    datePartText: {
      flexShrink: 1,
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    descInput: {
      minHeight: 88,
      borderRadius: 10,
      padding: 0,
      color: colors.text,
      fontSize: 15,
      lineHeight: 22,
      textAlignVertical: 'top',
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      marginTop: 4,
    },
    primaryBtnText: { color: '#fff', fontWeight: '700' },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.background,
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
    addRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
    addInput: {
      flex: 1,
      height: 42,
      borderRadius: 10,
      paddingHorizontal: 12,
      backgroundColor: colors.background,
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
    attachRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 12,
      marginBottom: 6,
    },
    attachMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    attachName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
    comment: {
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 10,
      marginBottom: 8,
    },
    commentAuthor: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 2 },
    commentBody: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    dangerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 8,
      paddingVertical: 14,
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
      maxHeight: '80%',
    },
    sheetOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    sheetCard: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: Platform.OS === 'ios' ? 28 : 18,
      maxHeight: '78%',
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    sheetClose: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 2,
    },
    sheetScroll: {
      maxHeight: 360,
      marginBottom: 8,
    },
    sheetScrollContent: {
      gap: 8,
      paddingBottom: 4,
    },
    labelOption: {
      minHeight: 44,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    labelOptionText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
    },
    labelOptionCheck: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sheetSecondaryBtn: {
      alignItems: 'center',
      paddingVertical: 10,
      marginBottom: 4,
    },
    sheetSecondaryText: {
      fontSize: 13,
      fontWeight: '600',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 14,
    },
    modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    modalInput: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: colors.background,
      color: colors.text,
      fontSize: 15,
      marginBottom: 10,
    },
    moveRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 10,
    },
    moveRowActive: { backgroundColor: colors.background },
    moveText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  });
}
