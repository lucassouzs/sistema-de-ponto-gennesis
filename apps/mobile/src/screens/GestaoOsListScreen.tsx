import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Alert
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Wrench } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import {
  fetchAssignedWorkOrders,
  fetchGestaoOsMe,
  setGestaoOsCompanyId,
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
  CLOSED: 'Encerrada',
  CANCELLED: 'Cancelada'
};

export default function GestaoOsListScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [qrToken, setQrToken] = useState('');

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
    meQuery.refetch();
    listQuery.refetch();
  }, [meQuery, listQuery]);

  const memberships = meQuery.data?.memberships ?? [];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
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
            Abrir chamado via token do QR do ativo
          </Text>
          <TextInput
            value={qrToken}
            onChangeText={setQrToken}
            placeholder="Cole o token do QR"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              const token = qrToken.trim();
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
  primaryBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center'
  },
  primaryBtnText: { color: '#fff', fontWeight: '700' },
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
