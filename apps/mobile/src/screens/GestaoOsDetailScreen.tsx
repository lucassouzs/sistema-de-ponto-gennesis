import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import {
  GESTAO_OS_SAFETY_CHECKLIST_ITEMS,
  fetchWorkOrder,
  transitionWorkOrder,
  patchWorkOrder,
  uploadGestaoOsAttachment,
  readCloseQrToken,
  clearCloseQrToken,
  syncGestaoOsOfflineQueue,
  loadGestaoOsLocalDraft,
  saveGestaoOsLocalDraft,
  clearGestaoOsLocalDraft
} from '../services/gestaoOs';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'GestaoOsDetail'>;

type ChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
};

type SafetyItem = {
  id: string;
  label: string;
  checked: boolean;
  required?: boolean;
};

const NEXT: Record<string, string[]> = {
  APPROVED: ['IN_PROGRESS'],
  SAFETY_CHECK: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_PARTS', 'COMPLETED'],
  WAITING_PARTS: ['IN_PROGRESS', 'COMPLETED'],
  REWORK: ['IN_PROGRESS']
};

const LABEL: Record<string, string> = {
  IN_PROGRESS: 'Iniciar / Retomar',
  WAITING_PARTS: 'Aguardando peça',
  COMPLETED: 'Concluir serviço'
};

function mergeSafetyChecklist(items?: SafetyItem[] | null): SafetyItem[] {
  const byId = new Map((items || []).map((item) => [item.id, item]));
  return GESTAO_OS_SAFETY_CHECKLIST_ITEMS.map((item) => ({
    ...item,
    checked: Boolean(byId.get(item.id)?.checked)
  }));
}

export default function GestaoOsDetailScreen({ route }: Props) {
  const { id } = route.params;
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [safetyChecklist, setSafetyChecklist] = useState<SafetyItem[]>([]);
  const [safetyPhotoUrl, setSafetyPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [startPhotoUrl, setStartPhotoUrl] = useState<string | null>(null);
  const [endPhotoUrl, setEndPhotoUrl] = useState<string | null>(null);
  const [uploadingStart, setUploadingStart] = useState(false);
  const [uploadingEnd, setUploadingEnd] = useState(false);
  const [parts, setParts] = useState<Array<{ id: string; name: string; quantity: number }>>([]);
  const [newPartName, setNewPartName] = useState('');

  const query = useQuery({
    queryKey: ['gestao-os-detail', id],
    queryFn: () => fetchWorkOrder(id)
  });

  useEffect(() => {
    void syncGestaoOsOfflineQueue().then(() => {
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-detail', id] });
    });
  }, [id, queryClient]);

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    let cancelled = false;
    void loadGestaoOsLocalDraft(id).then((draft) => {
      if (cancelled) return;
      const nextChecklist: ChecklistItem[] = Array.isArray(draft?.checklist)
        ? (draft.checklist as ChecklistItem[])
        : Array.isArray(data.checklistResponses)
          ? data.checklistResponses
          : [];
      setChecklist(nextChecklist);
      if (
        data.status === 'APPROVED' ||
        data.status === 'SAFETY_CHECK' ||
        (Array.isArray(data.safetyChecklistResponses) && data.safetyChecklistResponses.length > 0) ||
        (draft?.safetyChecklist && draft.safetyChecklist.length > 0)
      ) {
        setSafetyChecklist(
          mergeSafetyChecklist(draft?.safetyChecklist ?? data.safetyChecklistResponses)
        );
      }
      setSafetyPhotoUrl(draft?.safetyPhotoUrl ?? data.safetyPhotoUrl ?? null);
      setStartPhotoUrl(draft?.startPhotoUrl ?? data.startPhotoUrl ?? null);
      setEndPhotoUrl(draft?.endPhotoUrl ?? data.endPhotoUrl ?? null);
      setParts(
        Array.isArray(draft?.parts)
          ? draft.parts.map((p) => ({ id: p.id, name: p.name, quantity: p.quantity || 1 }))
          : Array.isArray(data.parts)
            ? data.parts.map((p) => ({ id: p.id, name: p.name, quantity: p.quantity || 1 }))
            : []
      );
      if (draft?.note) setNote(draft.note);
    });
    return () => {
      cancelled = true;
    };
  }, [query.data, id]);

  const mutation = useMutation({
    mutationFn: async (status: string) => {
      const closeQrToken =
        status === 'COMPLETED' ? (await readCloseQrToken()) || undefined : undefined;
      const result = await transitionWorkOrder(id, {
        status,
        note: note.trim() || undefined,
        completionNote: status === 'COMPLETED' ? note.trim() || 'Concluído em campo' : undefined,
        checklistResponses: checklist.length ? checklist : undefined,
        safetyChecklistResponses: safetyChecklist.length ? safetyChecklist : undefined,
        safetyPhotoUrl: safetyPhotoUrl || undefined,
        startPhotoUrl: startPhotoUrl || undefined,
        endPhotoUrl: endPhotoUrl || undefined,
        closeQrToken,
        parts:
          status === 'WAITING_PARTS' || parts.length
            ? parts.map((p) => ({
                id: p.id,
                name: p.name,
                supplier: null,
                quantity: p.quantity || 1,
                unitCost: null,
                expectedAt: null,
                notes: null
              }))
            : undefined,
        signatureTechnicianUrl: status === 'COMPLETED' ? 'mobile:assinatura-tecnico' : undefined
      });
      if (status === 'COMPLETED') await clearCloseQrToken();
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestao-os-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['gestao-os-assigned'] });
      Alert.alert('Status atualizado');
      setNote('');
    },
    onError: (err: Error) => Alert.alert('Erro', err.message)
  });

  const persistProgress = async (next?: {
    checklist?: ChecklistItem[];
    safetyChecklist?: SafetyItem[];
    safetyPhotoUrl?: string | null;
    startPhotoUrl?: string | null;
    endPhotoUrl?: string | null;
    parts?: Array<{ id: string; name: string; quantity: number }>;
    note?: string;
  }) => {
    const payload = {
      checklist: next?.checklist ?? checklist,
      safetyChecklist: next?.safetyChecklist ?? safetyChecklist,
      safetyPhotoUrl: next?.safetyPhotoUrl !== undefined ? next.safetyPhotoUrl : safetyPhotoUrl,
      startPhotoUrl: next?.startPhotoUrl !== undefined ? next.startPhotoUrl : startPhotoUrl,
      endPhotoUrl: next?.endPhotoUrl !== undefined ? next.endPhotoUrl : endPhotoUrl,
      parts: next?.parts ?? parts,
      note: next?.note ?? note
    };
    await saveGestaoOsLocalDraft(id, payload);
    try {
      await patchWorkOrder(id, {
        checklistResponses: payload.checklist.length ? payload.checklist : undefined,
        safetyChecklistResponses: payload.safetyChecklist.length
          ? payload.safetyChecklist
          : undefined,
        safetyPhotoUrl: payload.safetyPhotoUrl || undefined,
        startPhotoUrl: payload.startPhotoUrl || undefined,
        endPhotoUrl: payload.endPhotoUrl || undefined,
        parts: payload.parts.length
          ? payload.parts.map((p) => ({
              id: p.id,
              name: p.name,
              supplier: null,
              quantity: p.quantity || 1,
              unitCost: null,
              expectedAt: null,
              notes: null
            }))
          : undefined
      });
      await clearGestaoOsLocalDraft(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!/sem rede/i.test(msg)) {
        Alert.alert('Aviso', msg || 'Não foi possível gravar o progresso agora.');
      }
    }
  };

  const takeSafetyPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da câmera para a foto com os EPIs.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadGestaoOsAttachment({
        uri: asset.uri,
        name: asset.fileName || `foto-epis-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg'
      });
      if (!uploaded?.url) throw new Error('URL da foto não retornada');
      setSafetyPhotoUrl(uploaded.url);
      await persistProgress({ safetyPhotoUrl: uploaded.url });
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Falha ao enviar a foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const capturePhoto = async (
    setUrl: (url: string) => void,
    setBusy: (busy: boolean) => void,
    field: 'startPhotoUrl' | 'endPhotoUrl'
  ) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da câmera para registrar a foto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    const asset = result.assets[0];
    setBusy(true);
    try {
      const uploaded = await uploadGestaoOsAttachment({
        uri: asset.uri,
        name: asset.fileName || `foto-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg'
      });
      if (!uploaded?.url) throw new Error('URL da foto não retornada');
      setUrl(uploaded.url);
      await persistProgress({ [field]: uploaded.url });
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Falha ao enviar a foto');
    } finally {
      setBusy(false);
    }
  };

  const captureChecklistPhoto = async (index: number, field: 'beforePhotoUrl' | 'afterPhotoUrl') => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da câmera para registrar a foto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadGestaoOsAttachment({
        uri: asset.uri,
        name: asset.fileName || `foto-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg'
      });
      if (!uploaded?.url) throw new Error('URL da foto não retornada');
      const next = checklist.map((row, i) => (i === index ? { ...row, [field]: uploaded.url } : row));
      setChecklist(next);
      await persistProgress({ checklist: next });
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Falha ao enviar a foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const addPart = () => {
    const name = newPartName.trim();
    if (!name) return;
    setParts((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, quantity: 1 }
    ]);
    setNewPartName('');
  };

  const wo = query.data;
  const actions = useMemo(() => (wo ? NEXT[wo.status] || [] : []), [wo]);
  const safetyReady =
    safetyChecklist.length > 0 &&
    safetyChecklist.every((item) => item.required === false || item.checked) &&
    Boolean(safetyPhotoUrl);
  const executionReady =
    checklist.length === 0 ||
    checklist.every(
      (item) =>
        !!item.checked &&
        !!item.startedAt &&
        !!item.completedAt &&
        !!item.beforePhotoUrl &&
        !!item.afterPhotoUrl
    );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title="Detalhe da OS" showBack />
      {query.isLoading || !wo ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={[styles.title, { color: colors.text }]}>
            {wo.osNumber != null ? `OS #${wo.osNumber}` : `Chamado #${wo.displayNumber}`}
          </Text>
          <Text style={{ color: colors.textSecondary, marginTop: 4 }}>
            {wo.status} · {wo.priority} · {wo.category}
          </Text>
          <Text style={[styles.desc, { color: colors.text }]}>{wo.description}</Text>
          {wo.locationLabel ? (
            <Text style={{ color: colors.textSecondary, marginTop: 8 }}>{wo.locationLabel}</Text>
          ) : null}

          {wo.status === 'APPROVED' || wo.status === 'SAFETY_CHECK' ? (
            <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.boxTitle, { color: colors.text }]}>
                Segurança do trabalho
              </Text>
              <Text style={{ color: colors.textSecondary, marginBottom: 10, fontSize: 13 }}>
                Marque os EPIs e envie uma foto usando os equipamentos antes de iniciar a execução.
              </Text>
              {safetyChecklist.map((item, idx) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.checkRow}
                  onPress={() => {
                    setSafetyChecklist((prev) => {
                      const next = prev.map((row, i) =>
                        i === idx ? { ...row, checked: !row.checked } : row
                      );
                      void persistProgress({ safetyChecklist: next });
                      return next;
                    });
                  }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: colors.border,
                        backgroundColor: item.checked ? colors.primary : 'transparent'
                      }
                    ]}
                  />
                  <Text style={{ color: colors.text, flex: 1 }}>{item.label}</Text>
                </TouchableOpacity>
              ))}
              {safetyPhotoUrl ? (
                <Image source={{ uri: safetyPhotoUrl }} style={styles.photo} />
              ) : null}
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                disabled={uploadingPhoto}
                onPress={() => void takeSafetyPhoto()}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {uploadingPhoto ? 'Enviando foto...' : safetyPhotoUrl ? 'Tirar outra foto' : 'Tirar foto com EPIs'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {checklist.length > 0 ? (
            <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.boxTitle, { color: colors.text }]}>Checklist</Text>
              <Text style={{ color: colors.textSecondary, marginBottom: 10, fontSize: 13 }}>
                Marque o item, registre o horário e tire foto de antes e depois. Sem rede, o
                progresso fica no aparelho e sincroniza depois.
              </Text>
              {checklist.map((item, idx) => (
                <View key={item.id} style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    style={styles.checkRow}
                    onPress={() => {
                      const now = new Date().toISOString();
                      setChecklist((prev) => {
                        const next = prev.map((row, i) => {
                          if (i !== idx) return row;
                          const checked = !row.checked;
                          if (!checked) return { ...row, checked: false, completedAt: null };
                          return {
                            ...row,
                            checked: true,
                            startedAt: row.startedAt || now,
                            completedAt: now
                          };
                        });
                        void persistProgress({ checklist: next });
                        return next;
                      });
                    }}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: colors.border,
                          backgroundColor: item.checked ? colors.primary : 'transparent'
                        }
                      ]}
                    />
                    <Text style={{ color: colors.text, flex: 1 }}>{item.label}</Text>
                  </TouchableOpacity>
                  {item.beforePhotoUrl ? (
                    <Image source={{ uri: item.beforePhotoUrl }} style={styles.photo} />
                  ) : null}
                  {item.afterPhotoUrl ? (
                    <Image source={{ uri: item.afterPhotoUrl }} style={styles.photo} />
                  ) : null}
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.btn, { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                      onPress={() => void captureChecklistPhoto(idx, 'beforePhotoUrl')}
                    >
                      <Text style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }}>
                        Foto antes
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, { flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                      onPress={() => void captureChecklistPhoto(idx, 'afterPhotoUrl')}
                    >
                      <Text style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }}>
                        Foto depois
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {actions.includes('IN_PROGRESS') ? (
            <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.boxTitle, { color: colors.text }]}>Foto de início</Text>
              <Text style={{ color: colors.textSecondary, marginBottom: 10, fontSize: 13 }}>
                Registre uma foto antes de iniciar a execução.
              </Text>
              {startPhotoUrl ? <Image source={{ uri: startPhotoUrl }} style={styles.photo} /> : null}
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                disabled={uploadingStart}
                onPress={() => void capturePhoto(setStartPhotoUrl, setUploadingStart, 'startPhotoUrl')}
              >
                <Text style={{ color: colors.text, fontWeight: '700' }}>
                  {uploadingStart ? 'Enviando foto...' : startPhotoUrl ? 'Tirar outra foto' : 'Tirar foto de início'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {actions.includes('WAITING_PARTS') ? (
            <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.boxTitle, { color: colors.text }]}>Peças / materiais</Text>
              {parts.map((part) => (
                <View key={part.id} style={styles.partRow}>
                  <Text style={{ color: colors.text, flex: 1 }}>{part.name}</Text>
                  <TouchableOpacity
                    onPress={() => setParts((prev) => prev.filter((p) => p.id !== part.id))}
                  >
                    <Text style={{ color: '#ef4444', fontWeight: '700' }}>Remover</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <View style={styles.partAddRow}>
                <TextInput
                  value={newPartName}
                  onChangeText={setNewPartName}
                  placeholder="Nome da peça"
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.partInput,
                    { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }
                  ]}
                  onSubmitEditing={addPart}
                />
                <TouchableOpacity
                  style={[styles.partAddBtn, { backgroundColor: colors.primary }]}
                  onPress={addPart}
                >
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Adicionar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {actions.includes('COMPLETED') ? (
            <>
              <Text style={{ color: colors.textSecondary, marginBottom: 8, fontSize: 13 }}>
                Para concluir, leia o QR do responsável da localidade (scanner na lista) e envie
                foto de antes/depois de cada item.
              </Text>
              <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.boxTitle, { color: colors.text }]}>Foto de conclusão</Text>
                <Text style={{ color: colors.textSecondary, marginBottom: 10, fontSize: 13 }}>
                  {executionReady
                    ? 'Registre uma foto antes de concluir o serviço.'
                    : 'Marque todos os itens do checklist de execução antes de concluir.'}
                </Text>
                {endPhotoUrl ? <Image source={{ uri: endPhotoUrl }} style={styles.photo} /> : null}
                <TouchableOpacity
                  style={[styles.btn, { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
                  disabled={uploadingEnd}
                  onPress={() => void capturePhoto(setEndPhotoUrl, setUploadingEnd, 'endPhotoUrl')}
                >
                  <Text style={{ color: colors.text, fontWeight: '700' }}>
                    {uploadingEnd ? 'Enviando foto...' : endPhotoUrl ? 'Tirar outra foto' : 'Tirar foto de conclusão'}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Observação / conclusão"
            placeholderTextColor={colors.textSecondary}
            multiline
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }
            ]}
          />

          {actions.map((status) => {
            const blocked =
              mutation.isPending ||
              uploadingPhoto ||
              uploadingStart ||
              uploadingEnd ||
              (status === 'IN_PROGRESS' &&
                (wo.status === 'APPROVED' || wo.status === 'SAFETY_CHECK') &&
                !safetyReady) ||
              (status === 'IN_PROGRESS' && !startPhotoUrl) ||
              (status === 'COMPLETED' && (!endPhotoUrl || !executionReady)) ||
              (status === 'WAITING_PARTS' && parts.length === 0);
            return (
              <TouchableOpacity
                key={status}
                style={[styles.btn, { backgroundColor: colors.primary, opacity: blocked ? 0.5 : 1 }]}
                disabled={blocked}
                onPress={() => mutation.mutate(status)}
              >
                <Text style={styles.btnText}>{LABEL[status] || status}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700' },
  desc: { marginTop: 12, fontSize: 15, lineHeight: 22 },
  box: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 16 },
  boxTitle: { fontWeight: '700', marginBottom: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  checkbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 90,
    padding: 12,
    marginTop: 16,
    textAlignVertical: 'top'
  },
  btn: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center'
  },
  btnText: { color: '#fff', fontWeight: '700' },
  photo: { width: '100%', height: 180, borderRadius: 10, marginTop: 8, marginBottom: 4 },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8
  },
  partAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  partInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  partAddBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center'
  }
});
