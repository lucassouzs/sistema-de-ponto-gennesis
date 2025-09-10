import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

const MOCK_RECORDS = [
  {
    id: '1',
    type: 'ENTRY',
    timestamp: '2024-01-15T08:05:00Z',
    isValid: true,
  },
  {
    id: '2',
    type: 'LUNCH_START',
    timestamp: '2024-01-15T12:00:00Z',
    isValid: true,
  },
  {
    id: '3',
    type: 'LUNCH_END',
    timestamp: '2024-01-15T13:00:00Z',
    isValid: true,
  },
  {
    id: '4',
    type: 'EXIT',
    timestamp: '2024-01-15T17:10:00Z',
    isValid: true,
  },
];

export default function TimeRecordsScreen() {
  const navigation = useNavigation();

  const getTypeLabel = (type: string) => {
    const types = {
      ENTRY: 'Entrada',
      EXIT: 'Saída',
      LUNCH_START: 'Início Almoço',
      LUNCH_END: 'Fim Almoço',
      BREAK_START: 'Início Pausa',
      BREAK_END: 'Fim Pausa',
    };
    return types[type as keyof typeof types] || type;
  };

  const getTypeIcon = (type: string) => {
    const icons = {
      ENTRY: '🌅',
      EXIT: '🌆',
      LUNCH_START: '🍽️',
      LUNCH_END: '🍽️',
      BREAK_START: '☕',
      BREAK_END: '☕',
    };
    return icons[type as keyof typeof icons] || '⏰';
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>‹ Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Meus Registros</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Records List */}
      <View style={styles.recordsContainer}>
        {MOCK_RECORDS.map((record) => (
          <View key={record.id} style={styles.recordCard}>
            <View style={styles.recordLeft}>
              <Text style={styles.recordIcon}>
                {getTypeIcon(record.type)}
              </Text>
              <View style={styles.recordInfo}>
                <Text style={styles.recordType}>
                  {getTypeLabel(record.type)}
                </Text>
                <Text style={styles.recordTime}>
                  {formatTime(record.timestamp)}
                </Text>
              </View>
            </View>
            <View style={styles.recordRight}>
              <Text style={styles.recordDate}>
                {formatDate(record.timestamp)}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  record.isValid ? styles.statusValid : styles.statusInvalid,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    record.isValid ? styles.statusTextValid : styles.statusTextInvalid,
                  ]}
                >
                  {record.isValid ? '✓ Válido' : '✗ Inválido'}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </View>

      {/* Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Resumo do Dia</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Horas Trabalhadas:</Text>
          <Text style={styles.summaryValue}>8h 5min</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Horas de Almoço:</Text>
          <Text style={styles.summaryValue}>1h</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Status:</Text>
          <Text style={[styles.summaryValue, styles.statusComplete]}>
            ✓ Completo
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '500',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  placeholder: {
    width: 60,
  },
  recordsContainer: {
    padding: 20,
  },
  recordCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  recordLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  recordIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  recordInfo: {
    flex: 1,
  },
  recordType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  recordTime: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 2,
  },
  recordRight: {
    alignItems: 'flex-end',
  },
  recordDate: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusValid: {
    backgroundColor: '#dcfce7',
  },
  statusInvalid: {
    backgroundColor: '#fef2f2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusTextValid: {
    color: '#166534',
  },
  statusTextInvalid: {
    color: '#dc2626',
  },
  summaryCard: {
    backgroundColor: '#fff',
    margin: 20,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  statusComplete: {
    color: '#166534',
  },
});
