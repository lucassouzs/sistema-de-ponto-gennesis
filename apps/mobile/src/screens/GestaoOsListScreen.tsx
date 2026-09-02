import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert,
  Modal
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Camera as CameraIcon, Wrench, X } from 'lucide-react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import {
  fetchAssignedWorkOrders,
  fetchGestaoOsMe,
  setGestaoOsCompanyId,
  syncGestaoOsOfflineQueue,
  type GestaoOsWorkOrderMobile
} from '../services/gestaoOs';
import type { RootStackParamList } from '../../App';

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberta',
  UNDER_REVIEW: 'Em análise',
  APPROVED: 'Aprovada',
  SAFETY_CHECK: 'Segurança do trabalho',
  IN_PROGRESS: 'Em execução',
  WAITING_PARTS: 'Aguardando peça',
  COMPLETED: 'Concluída',
  REWORK: 'Aguardando Ajuste',
  CLOSED: 'Encerrada',
  CANCELLED: 'Cancelada'
};

function extractQrToken(raw: string): string {
  const value = (raw || '').trim();
  const qrMatch = value.match(/[?&]qr=([^&]+)/i);
  if (qrMatch) return decodeURIComponent(qrMatch[1]);
  const tokenMatch = value.match(/[?&]token=([^&]+)/i);
  if (tokenMatch) return decodeURIComponent(tokenMatch[1]);
  return value;
}

export default function GestaoOsListScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [qrToken, setQrToken] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLockRef = useRef(false);

  const openScanner = async () => {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Permissão da câmera', 'Precisamos da câmera para ler o QR do ativo.');
        return;
      }
    }
    scanLockRef.current = false;
    setScannerOpen(true);
  };

  const onScanned = (result: BarcodeScanningResult) => {
    if (scanLockRef.current) return;
    const token = extractQrToken(result?.data ?? '');
    if (!token) return;
    scanLockRef.current = true;
    setScannerOpen(false);
    setQrToken(token);
    navigation.navigate('GestaoOsQr', { token });
  };

  const meQuery = useQuery({
    queryKey: ['gestao-os-me-mobile'],
    queryFn: fetchGestaoOsMe
  });

  const listQuery = useQuery({
    queryKey: ['gestao-os-assigned', meQuery.data?.activeCompanyId],
    enabled: !!meQuery.data,
    queryFn: fetchAssignedWorkOrders
  });

  const onRefresh = useCallback(() => {
    void syncGestaoOsOfflineQueue().then(() => {
      meQuery.refetch();
      listQuery.refetch();
    });
  }, [meQuery, listQuery]);

  const memberships = meQuery.data?.memberships ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.screenRoot }]}>
      <AppHeader title="Central de Chamados" />
      <View style={styles.body}>
        {memberships.length > 1 ? (
          <View style={styles.companyRow}>
            {memberships.map((m: { companyId: string; company: { name: string } }) => (
              <TouchableOpacity
                key={m.companyId}
                style={[
                  styles.companyChip,
                  {
                    borderColor: colors.border,
                    backgroundColor:
                      meQuery.data?.activeCompanyId === m.companyId ? colors.primary : colors.card
                  }
                ]}
                onPress={async () => {
                  await setGestaoOsCompanyId(m.companyId);
                  meQuery.refetch();
                  listQuery.refetch();
                }}
              >
                <Text
                  style={{
                    color:
                      meQuery.data?.activeCompanyId === m.companyId ? '#fff' : colors.text,
                    fontSize: 12,
                    fontWeight: '600'
                  }}
                >
                  {m.company.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={[styles.qrBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={[styles.qrLabel, { color: colors.textSecondary }]}>
            Abrir chamado via QR do ativo
          </Text>
          <TouchableOpacity
            style={[styles.cameraBtn, { borderColor: colors.primary }]}
            onPress={() => void openScanner()}
          >
            <CameraIcon size={18} color={colors.primary} />
            <Text style={[styles.cameraBtnText, { color: colors.primary }]}>
              Usar câmera para ler o QR
            </Text>
          </TouchableOpacity>
          <TextInput
            value={qrToken}
            onChangeText={setQrToken}
            placeholder="Ou cole o token do QR"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              const token = extractQrToken(qrToken);
              if (!token) {
                Alert.alert('Informe o token do QR');
                return;
              }
              navigation.navigate('GestaoOsQr', { token });
            }}
          >
            <Text style={styles.primaryBtnText}>Resolver QR</Text>
          </TouchableOpacity>
        </View>

        <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
          <View style={styles.scannerContainer}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onScanned}
            />
            <View style={styles.scannerOverlay}>
              <View style={styles.scannerFrame} />
              <Text style={styles.scannerHint}>Aponte para o QR Code do ativo</Text>
            </View>
            <TouchableOpacity
              style={styles.scannerClose}
              onPress={() => setScannerOpen(false)}
            >
              <X size={22} color="#fff" />
              <Text style={styles.scannerCloseText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </Modal>

        <Text style={[styles.sectionTitle, { color: colors.text }]}>Minhas OS</Text>
        <FlatList
          data={(listQuery.data as GestaoOsWorkOrderMobile[]) || []}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={!!listQuery.isFetching} onRefresh={onRefresh} />
          }
          ListEmptyComponent={
            <Text style={{ color: colors.textSecondary, marginTop: 24, textAlign: 'center' }}>
              {listQuery.isLoading ? 'Carregando...' : 'Nenhuma OS atribuída a você.'}
            </Text>
          }
          renderItem={({ item }) => {
            const overdue =
              item.dueAt &&
              new Date(item.dueAt) < new Date() &&
              !['CLOSED', 'CANCELLED', 'COMPLETED'].includes(item.status);
            return (
              <TouchableOpacity
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => navigation.navigate('GestaoOsDetail', { id: item.id })}
              >
                <View style={styles.cardTop}>
                  <Wrench size={16} color={colors.primary} />
                  <Text style={[styles.cardTitle, { color: colors.text }]}>
                    {item.osNumber != null ? `OS #${item.osNumber}` : `Chamado #${item.displayNumber}`}
                  </Text>
                  {overdue ? (
                    <Text style={styles.overdue}>Atrasada</Text>
                  ) : null}
                </View>
                <Text style={{ color: colors.textSecondary, marginTop: 4 }}>
                  {STATUS_LABEL[item.status] || item.status} · {item.category}
                </Text>
                <Text style={{ color: colors.text, marginTop: 6 }} numberOfLines={2}>
                  {item.description}
                </Text>
                {item.locationLabel ? (
                  <Text style={{ color: colors.textSecondary, marginTop: 4, fontSize: 12 }}>
                    {item.locationLabel}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  companyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  companyChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  qrBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16
  },
  qrLabel: { fontSize: 12, marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8
  },
  cameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 8
  },
  cameraBtnText: { fontWeight: '700' },
  primaryBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center'
  },
  scannerFrame: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: 16,
    backgroundColor: 'transparent'
  },
  scannerHint: { color: '#fff', marginTop: 16, fontSize: 14, fontWeight: '600' },
  scannerClose: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 999
  },
  scannerCloseText: { color: '#fff', fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontWeight: '700', flex: 1 },
  overdue: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700'
  }
});
