import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import {
  fetchWorkOrder,
  transitionWorkOrder,
  type GestaoOsWorkOrderMobile
} from '../services/gestaoOs';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'GestaoOsDetail'>;

const NEXT: Record<string, string[]> = {
  APPROVED: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_PARTS', 'COMPLETED'],
  WAITING_PARTS: ['IN_PROGRESS', 'COMPLETED']
};

const LABEL: Record<string, string> = {
  IN_PROGRESS: 'Iniciar / Retomar',
  WAITING_PARTS: 'Aguardando peça',
  COMPLETED: 'Concluir serviço'
};

export default function GestaoOsDetailScreen({ route }: Props) {
  const { id } = route.params;
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [checklist, setChecklist] = useState<
    Array<{ id: string; label: string; checked: boolean }>
  >([]);

  const query = useQuery({
    queryKey: ['gestao-os-detail', id],
    queryFn: () => fetchWorkOrder(id)
  });

  useEffect(() => {
    const data = query.data;
    if (data && Array.isArray(data.checklistResponses)) {
      setChecklist(data.checklistResponses);
    }
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (status: string) =>
      transitionWorkOrder(id, {
        status,
        note: note.trim() || undefined,
        completionNote: status === 'COMPLETED' ? note.trim() || 'Concluído em campo' : undefined,
        checklistResponses: checklist.length ? checklist : undefined,
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

  const wo = query.data;
  const actions = useMemo(() => (wo ? NEXT[wo.status] || [] : []), [wo]);

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

          {actions.map((status) => (
            <TouchableOpacity
              key={status}
              style={[styles.btn, { backgroundColor: colors.primary }]}
              disabled={mutation.isPending}
              onPress={() => mutation.mutate(status)}
            >
              <Text style={styles.btnText}>{LABEL[status] || status}</Text>
            </TouchableOpacity>
          ))}
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
  btnText: { color: '#fff', fontWeight: '700' }
});
