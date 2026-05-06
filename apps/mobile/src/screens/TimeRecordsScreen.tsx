import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft, LogIn, LogOut, Utensils, RotateCw, Coffee, Clock, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import api from '../services/api';

export type TimeRecord = {
  id: string;
  type: string;
  timestamp: string;
  isValid: boolean;
  observation?: string;
};

interface GroupedRecords {
  [date: string]: TimeRecord[];
}

export default function TimeRecordsScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const styles = getStyles(colors);

  useEffect(() => {
    fetchRecords();
  }, [selectedMonth, selectedYear]);

  const fetchRecords = async () => {
    try {
      setLoading(true);
      
      const startDate = new Date(selectedYear, selectedMonth, 1);
      const endDate = new Date(selectedYear, selectedMonth + 1, 0);
      
      const res = await api.get(
        `/api/time-records/my-records?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
      );
      
      if (!res.ok) {
        throw new Error('Erro ao carregar registros');
      }
      
      const data = await res.json();
      const list = (data.data || data) as TimeRecord[];
      setRecords(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchRecords();
  };

  const getTypeLabel = (type: string) => {
    const types = {
      ENTRY: 'Entrada',
      EXIT: 'Saída',
      LUNCH_START: 'Almoço',
      LUNCH_END: 'Retorno',
      BREAK_START: 'Início Pausa',
      BREAK_END: 'Fim Pausa',
    };
    return types[type as keyof typeof types] || type;
  };

  const getTypeIcon = (type: string) => {
    const icons = {
      ENTRY: LogIn,
      EXIT: LogOut,
      LUNCH_START: Utensils,
      LUNCH_END: RotateCw,
      BREAK_START: Coffee,
      BREAK_END: Coffee,
    };
    return icons[type as keyof typeof icons] || Clock;
  };

  const formatTime = (timestamp: string) => {
    // Banco salva horário em UTC
    // Usar getUTCHours/Minutes para ler o valor correto
    const date = new Date(timestamp);
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const formatDate = (timestamp: string) => {
    // Usar valores locais para ler valores literais sem conversão
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getWeekday = (timestamp: string) => {
    const date = new Date(timestamp);
    const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    return days[date.getDay()];
  };

  // Agrupar registros por data
  const groupedRecords: GroupedRecords = records.reduce((acc, record) => {
    const date = formatDate(record.timestamp);
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(record);
    return acc;
  }, {} as GroupedRecords);

  const changeMonth = (delta: number) => {
    const newDate = new Date(selectedYear, selectedMonth + delta);
    setSelectedMonth(newDate.getMonth());
    setSelectedYear(newDate.getFullYear());
  };

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ce3736" />
          <Text style={styles.loadingText}>Carregando registros...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.title}>Meus Registros</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      {/* Seletor de Mês */}
      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthButton}>
          <ChevronLeft size={28} color={colors.primary} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.monthText}>
          {monthNames[selectedMonth]} {selectedYear}
        </Text>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthButton}>
          <ChevronRight size={28} color={colors.primary} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* Erro */}
      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Lista de Registros Agrupados */}
      {Object.keys(groupedRecords).length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Nenhum registro encontrado</Text>
        </View>
      ) : (
        Object.keys(groupedRecords)
          .sort((a, b) => new Date(b.split('/').reverse().join('-')).getTime() - new Date(a.split('/').reverse().join('-')).getTime())
          .map((date) => (
            <View key={date} style={styles.dayGroup}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayDate}>{date}</Text>
                <Text style={styles.dayWeekday}>
                  {getWeekday(groupedRecords[date][0].timestamp)}
                </Text>
              </View>
              <View style={styles.recordsGrid}>
                {groupedRecords[date]
                  .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                  .map((record) => {
                    const IconComponent = getTypeIcon(record.type);
                    return (
                      <View key={record.id} style={styles.recordCard}>
                        <IconComponent size={24} color="#ce3736" />
                        <Text style={styles.recordTime}>
                          {formatTime(record.timestamp)}
                        </Text>
                        {!record.isValid && (
                          <Text style={styles.invalidBadge}>Inválido</Text>
                        )}
                      </View>
                    );
                  })}
              </View>
            </View>
          ))
      )}
    </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
  },
  backButton: {
    padding: 4,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTextContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  placeholder: {
    width: 44,
    height: 44,
  },
  monthSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: colors.card,
    marginTop: 1,
  },
  monthButton: {
    padding: 8,
  },
  monthText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  errorCard: {
    margin: 20,
    marginTop: 0,
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
  emptyCard: {
    margin: 20,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  dayGroup: {
    margin: 20,
    marginBottom: 0,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dayDate: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  dayWeekday: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  recordsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  recordCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  recordTime: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  invalidBadge: {
    marginTop: 4,
    fontSize: 10,
    color: '#ef4444',
    fontWeight: '600',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    textAlign: 'center',
  },
});

