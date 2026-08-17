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
  uploadGestaoOsAttachment
} from '../services/gestaoOs';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'GestaoOsDetail'>;

type SafetyItem = {
  id: string;
  label: string;
  checked: boolean;
  required?: boolean;
};

const NEXT: Record<string, string[]> = {
  APPROVED: ['SAFETY_CHECK'],
  SAFETY_CHECK: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_PARTS', 'COMPLETED'],
  WAITING_PARTS: ['IN_PROGRESS', 'COMPLETED']
};

const LABEL: Record<string, string> = {
  SAFETY_CHECK: 'Ir para segurança do trabalho',
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
  const [checklist, setChecklist] = useState<
    Array<{ id: string; label: string; checked: boolean }>
  >([]);
  const [safetyChecklist, setSafetyChecklist] = useState<SafetyItem[]>([]);
  const [safetyPhotoUrl, setSafetyPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const query = useQuery({
    queryKey: ['gestao-os-detail', id],
    queryFn: () => fetchWorkOrder(id)
  });

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    if (Array.isArray(data.checklistResponses)) {
      setChecklist(data.checklistResponses);
    }
    if (
      data.status === 'SAFETY_CHECK' ||
      (Array.isArray(data.safetyChecklistResponses) && data.safetyChecklistResponses.length > 0)
    ) {
      setSafetyChecklist(mergeSafetyChecklist(data.safetyChecklistResponses));
    }
    setSafetyPhotoUrl(data.safetyPhotoUrl ?? null);
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (status: string) =>
      transitionWorkOrder(id, {
        status,
        note: note.trim() || undefined,
        completionNote: status === 'COMPLETED' ? note.trim() || 'Concluído em campo' : undefined,
        checklistResponses: checklist.length ? checklist : undefined,
        safetyChecklistResponses: safetyChecklist.length ? safetyChecklist : undefined,
        safetyPhotoUrl: safetyPhotoUrl || undefined,
        signatureTechnicianUrl: status === 'COMPLETED' ? 'mobile:assinatura-tecnico' : undefined
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestao-os-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['gestao-os-assigned'] });
      Alert.alert('Status atualizado');
      setNote('');
    },
    onError: (err: Error) => Alert.alert('Erro', err.message)
  });

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
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Falha ao enviar a foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const wo = query.data;
  const actions = useMemo(() => (wo ? NEXT[wo.status] || [] : []), [wo]);
  const safetyReady =
    safetyChecklist.length > 0 &&
    safetyChecklist.every((item) => item.required === false || item.checked) &&
    Boolean(safetyPhotoUrl);

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

          {wo.status === 'SAFETY_CHECK' ? (
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
                  onPress={() =>
                    setSafetyChecklist((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, checked: !row.checked } : row))
                    )
                  }
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
              {checklist.map((item, idx) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.checkRow}
                  onPress={() =>
                    setChecklist((prev) =>
                      prev.map((row, i) => (i === idx ? { ...row, checked: !row.checked } : row))
                    )
                  }
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
            </View>
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
              (status === 'IN_PROGRESS' && wo.status === 'SAFETY_CHECK' && !safetyReady);
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
  photo: { width: '100%', height: 180, borderRadius: 10, marginTop: 8, marginBottom: 4 }
});
