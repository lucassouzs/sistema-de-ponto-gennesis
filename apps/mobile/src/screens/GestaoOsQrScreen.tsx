import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import { createWorkOrderFromQr, resolveAssetQr, saveCloseQrToken } from '../services/gestaoOs';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'GestaoOsQr'>;

export default function GestaoOsQrScreen({ route, navigation }: Props) {
  const { token } = route.params;
  const { colors } = useTheme();
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [resolved, setResolved] = useState<{
    kind?: string;
    id?: string;
    name: string;
    category?: string | null;
    buildingId?: string;
    sectorId?: string;
    placeId?: string;
    locationLabel?: string;
    closeToken?: string;
    qrToken?: string;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await resolveAssetQr(token);
        if (!cancelled) setResolved(data);
      } catch (err) {
        if (!cancelled) Alert.alert('QR inválido', (err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const onSaveClose = async () => {
    const close = resolved?.closeToken || resolved?.qrToken || token.replace(/^gennesis-os-close:/, '');
    await saveCloseQrToken(close);
    Alert.alert(
      'QR da localidade',
      'Token salvo. Abra a OS e toque em Concluir serviço para encerrar com este QR.'
    );
    navigation.goBack();
  };

  const onCreate = async () => {
    if (resolved?.kind === 'building-close') {
      await onSaveClose();
      return;
    }
    if (!resolved?.buildingId) {
      Alert.alert('Ativo sem prédio vinculado');
      return;
    }
    if (!resolved?.sectorId || !resolved?.placeId) {
      Alert.alert('Ativo sem andar ou local vinculado');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Descreva o problema');
      return;
    }
    try {
      setLoading(true);
      const wo = await createWorkOrderFromQr({
        category: resolved.category || 'Manutenção',
        description: description.trim(),
        buildingId: resolved.buildingId,
        sectorId: resolved.sectorId,
        placeId: resolved.placeId,
        assetId: resolved.id,
        origin: 'UNPLANNED'
      });
      Alert.alert('Chamado aberto', `Chamado #${wo.displayNumber}`);
      navigation.replace('GestaoOsDetail', { id: wo.id });
    } catch (err) {
      Alert.alert('Erro', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const isClose = resolved?.kind === 'building-close';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <AppHeader title={isClose ? 'QR da localidade' : 'QR do ativo'} showBack />
      {loading && !resolved ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />
      ) : (
        <View style={styles.body}>
          <Text style={[styles.title, { color: colors.text }]}>
            {resolved?.name || (isClose ? 'Localidade' : 'Ativo')}
          </Text>
          <Text style={{ color: colors.textSecondary, marginTop: 4 }}>
            {isClose
              ? 'Use este QR para encerrar a OS no campo.'
              : resolved?.locationLabel || '—'}
          </Text>
          {isClose ? (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
              disabled={loading}
              onPress={() => void onSaveClose()}
            >
              <Text style={styles.btnText}>Usar para encerrar OS</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Descreva o problema encontrado"
                placeholderTextColor={colors.textSecondary}
                multiline
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }
                ]}
              />
              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.primary, opacity: loading ? 0.7 : 1 }]}
                disabled={loading}
                onPress={() => void onCreate()}
              >
                <Text style={styles.btnText}>Abrir chamado</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { padding: 16 },
  title: { fontSize: 18, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 110,
    padding: 12,
    marginTop: 16,
    textAlignVertical: 'top'
  },
  btn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center'
  },
  btnText: { color: '#fff', fontWeight: '700' }
});
