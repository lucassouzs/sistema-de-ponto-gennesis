import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Clock, Calendar, ChevronDown, ChevronUp, X } from 'lucide-react-native';
import api from '../services/api';

const { width } = Dimensions.get('window');

interface BankHoursData {
  startDate: string;
  endDate: string;
  totalOvertimeHours: number;
  totalOwedHours: number;
  balanceHours: number;
  totalOvertimeRaw: number;
  balanceHoursRaw: number;
}

interface DetailedDay {
  date: string;
  dayOfWeek: string;
  workedHours: number;
  expectedHours: number;
  overtimeHours: number;
  overtimeHours15: number;
  overtimeHours20: number;
  owedHours: number;
  entry?: string;
  exit?: string;
  lunchStart?: string;
  lunchEnd?: string;
}

interface DetailedBankHours {
  startDate: string;
  endDate: string;
  totalOvertimeHours: number;
  totalOwedHours: number;
  balanceHours: number;
  days: DetailedDay[];
}

export default function BankHoursScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = getStyles(colors);

  const [bankHoursData, setBankHoursData] = useState<BankHoursData | null>(null);
  const [detailedData, setDetailedData] = useState<DetailedBankHours | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Filtros de data
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [showDatePicker, setShowDatePicker] = useState(false);


  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  useEffect(() => {
    fetchBankHours();
  }, []);

  const fetchBankHours = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/time-records/my-records/bank-hours');
      
      if (!response.ok) {
        throw new Error('Erro na requisição');
      }
      
      const data = await response.json();
      setBankHoursData(data.data);
    } catch (error) {
      console.error('Erro ao buscar banco de horas:', error);
      Alert.alert('Erro', 'Não foi possível carregar o banco de horas');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetailedBankHoursForMonth = async (month: number, year: number) => {
    try {
      setLoadingDetails(true);
      
      // Cálculo das datas
      const monthIndex = month - 1; // Converter para índice (0-11)
      const startDate = new Date(year, monthIndex, 1);
      const endDate = new Date(year, monthIndex + 1, 0); // Último dia do mês
      
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        detailed: 'true',
      });
      
      const response = await api.get(`/api/time-records/my-records/bank-hours?${params}`);
      
      if (!response.ok) {
        throw new Error('Erro na requisição');
      }
      
      const data = await response.json();
      setDetailedData(data.data);
    } catch (error) {
      console.error('Erro ao buscar detalhamento:', error);
      Alert.alert('Erro', 'Não foi possível carregar o detalhamento');
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchDetailedBankHours = async () => {
    return fetchDetailedBankHoursForMonth(selectedMonth, selectedYear);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBankHours();
    setRefreshing(false);
  };

  const handleShowDetails = async () => {
    if (!detailedData) {
      await fetchDetailedBankHours();
    }
    setShowDetails(true);
  };

  const formatHours = (hours: number) => {
    const totalMinutes = Math.abs(hours) * 60;
    const h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60);
    const s = Math.floor((totalMinutes % 1) * 60);
    
    const sign = hours >= 0 ? '+' : '-';
    return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatHoursNoSign = (hours: number) => {
    const totalMinutes = Math.abs(hours) * 60;
    const h = Math.floor(totalMinutes / 60);
    const m = Math.floor(totalMinutes % 60);
    const s = Math.floor((totalMinutes % 1) * 60);
    
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatDay = (dateString: string) => {
    const date = new Date(dateString);
    const day = date.getDate();
    const dayOfWeek = date.toLocaleDateString('pt-BR', { weekday: 'short' });
    return `${day}\n${dayOfWeek}`;
  };

  const capitalizeFirstLetter = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Carregando banco de horas...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.safeArea}>
      <SafeAreaView edges={['top']} style={styles.topSafeArea} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <View style={styles.titleContainer}>
              <Text style={styles.title}>Banco de Horas</Text>
            </View>
            <Text style={styles.subtitle}>Cálculo do seu banco de horas</Text>
          </View>
          
          {/* Card Principal */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Saldo Atual</Text>
            </View>
            <View style={styles.cardContent}>
              <Text style={[
                styles.balanceText,
                { color: (bankHoursData?.balanceHours || 0) >= 0 ? colors.success : colors.primary }
              ]}>
                {bankHoursData ? formatHours(bankHoursData.balanceHours) : '00:00:00'}
              </Text>
              <Text style={styles.balanceLabel}>
                {(bankHoursData?.balanceHours || 0) >= 0 ? 'Saldo Positivo' : 'Saldo Negativo'}
              </Text>
            </View>
          </View>
        </View>

        {/* Cards Container */}
        <View style={styles.cardsContainer}>

          {/* Cards de Detalhamento */}
          <View style={styles.detailsGrid}>
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>Horas Extras</Text>
            <Text style={styles.detailValue}>
              {bankHoursData ? formatHoursNoSign(bankHoursData.totalOvertimeHours) : '00:00:00'}
            </Text>
          </View>
          
          <View style={styles.detailCard}>
            <Text style={styles.detailLabel}>Horas Devidas</Text>
            <Text style={styles.detailValue}>
              {bankHoursData ? formatHoursNoSign(bankHoursData.totalOwedHours) : '00:00:00'}
            </Text>
          </View>
        </View>

        {/* Botão Ver Detalhamento */}
        <TouchableOpacity
          style={styles.detailsButton}
          onPress={handleShowDetails}
        >
          <Calendar size={20} color={colors.primary} />
          <Text style={styles.detailsButtonText}>Ver detalhamento</Text>
        </TouchableOpacity>
        </View>

        {/* Modal de Detalhamento */}
        <Modal
          visible={showDetails}
          animationType="slide"
          presentationStyle="pageSheet"
        >
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Detalhamento do Banco de Horas</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setShowDetails(false)}
              >
                <X size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            {/* Filtros de Data */}
            <View style={styles.dateFilters}>
              <TouchableOpacity
                style={styles.dateFilter}
                onPress={() => setShowDatePicker(!showDatePicker)}
              >
                <Calendar size={16} color={colors.primary} />
                <Text style={styles.dateFilterText}>
                  {capitalizeFirstLetter(months[selectedMonth - 1])} de {selectedYear}
                </Text>
                {showDatePicker ? <ChevronUp size={16} color={colors.primary} /> : <ChevronDown size={16} color={colors.primary} />}
              </TouchableOpacity>

              {showDatePicker && (
                <View style={styles.datePicker}>
                  <View style={styles.yearSelector}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {years.map(year => (
                        <TouchableOpacity
                          key={year}
                          style={[
                            styles.yearButton,
                            selectedYear === year && styles.selectedYearButton
                          ]}
                          onPress={() => setSelectedYear(year)}
                        >
                          <Text style={[
                            styles.yearButtonText,
                            selectedYear === year && styles.selectedYearButtonText
                          ]}>
                            {year}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                  
                  <View style={styles.monthSelector}>
                    {months.map((month, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.monthButton,
                          selectedMonth === index + 1 && styles.selectedMonthButton
                        ]}
                        onPress={() => {
                          const newMonth = index + 1;
                          setSelectedMonth(newMonth);
                          setShowDatePicker(false);
                          fetchDetailedBankHoursForMonth(newMonth, selectedYear);
                        }}
                      >
                        <Text style={[
                          styles.monthButtonText,
                          selectedMonth === index + 1 && styles.selectedMonthButtonText
                        ]}>
                          {month}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* Tabela de Detalhamento */}
            <View style={styles.tableContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <ScrollView 
                  style={styles.table} 
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={true}
                >
                {/* Cabeçalho */}
                <View style={styles.tableHeader}>
                  <Text style={[styles.tableHeaderCell, { width: 80 }]}>Dia</Text>
                  <Text style={[styles.tableHeaderCell, { width: 100 }]}>Esperado</Text>
                  <Text style={[styles.tableHeaderCell, { width: 100 }]}>Trabalhado</Text>
                  <Text style={[styles.tableHeaderCell, { width: 100 }]}>Horas Normais</Text>
                  <Text style={[styles.tableHeaderCell, { width: 120 }]}>Extras (ponderadas)</Text>
                  <Text style={[styles.tableHeaderCell, { width: 100 }]}>Devidas</Text>
                </View>

                {/* Corpo */}
                {loadingDetails ? (
                  <View style={styles.loadingRow}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={styles.loadingText}>Carregando...</Text>
                  </View>
                ) : detailedData?.days && detailedData.days.length > 0 ? (
                  detailedData.days.map((day, index) => (
                    <View key={index} style={styles.tableRow}>
                      <Text style={[styles.dayCell, { width: 80 }]}>
                        {formatDay(day.date)}
                      </Text>
                      <Text style={[styles.tableCell, { width: 100 }]}>
                        {formatHoursNoSign(day.expectedHours)}
                      </Text>
                      <Text style={[styles.tableCell, { width: 100 }]}>
                        {formatHoursNoSign(day.workedHours)}
                      </Text>
                      <Text style={[styles.tableCell, { width: 100 }]}>
                        {formatHoursNoSign(Math.min(day.workedHours || 0, day.expectedHours || 0))}
                      </Text>
                      <Text style={[styles.tableCell, { width: 120 }]}>
                        {formatHoursNoSign(day.overtimeHours)}
                      </Text>
                      <Text style={[styles.tableCell, { width: 100 }]}>
                        {formatHoursNoSign(day.owedHours)}
                      </Text>
                    </View>
                  ))
                ) : (
                  <View style={styles.noDataRow}>
                    <Text style={styles.noDataText}>Nenhum dado encontrado</Text>
                  </View>
                )}
                </ScrollView>
              </ScrollView>
            </View>

            {/* Totais */}
            {detailedData && (
              <View style={styles.totalsContainer}>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total Esperado:</Text>
                  <Text style={styles.totalValue}>
                    {formatHoursNoSign(detailedData.days.reduce((acc, d) => acc + (d.expectedHours || 0), 0))}
                  </Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total Trabalhado:</Text>
                  <Text style={styles.totalValue}>
                    {formatHoursNoSign(detailedData.days.reduce((acc, d) => acc + (d.workedHours || 0), 0))}
                  </Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Horas Extras:</Text>
                  <Text style={styles.totalValue}>
                    {formatHoursNoSign(detailedData.totalOvertimeHours)}
                  </Text>
                </View>
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Horas Devidas:</Text>
                  <Text style={styles.totalValue}>
                    {formatHoursNoSign(detailedData.totalOwedHours)}
                  </Text>
                </View>
                <View style={[styles.totalRow, styles.finalTotalRow]}>
                  <Text style={styles.finalTotalLabel}>Saldo Final:</Text>
                  <Text style={[
                    styles.finalTotalValue,
                    { color: detailedData.balanceHours >= 0 ? colors.success : colors.error }
                  ]}>
                    {formatHours(detailedData.balanceHours)}
                  </Text>
                </View>
              </View>
            )}
          </SafeAreaView>
        </Modal>
        </ScrollView>
      </View>
    );
  }

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  topSafeArea: {
    backgroundColor: colors.headerBackground,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  cardsContainer: {
    paddingHorizontal: 20,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
  },
  header: {
    backgroundColor: colors.headerBackground,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    marginBottom: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleIcon: {
    marginRight: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    textAlign: 'center',
    opacity: 0.8,
    fontWeight: '500',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    elevation: 0,
  },
  cardHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  cardContent: {
    alignItems: 'center',
  },
  balanceText: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  detailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
  },
  detailCard: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    elevation: 0,
  },
  detailLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
    textAlign: 'center',
  },
  detailValue: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  detailsButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 12,
    gap: 8,
    elevation: 0,
  },
  detailsButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    padding: 8,
  },
  dateFilters: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  dateFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 12,
  },
  dateFilterText: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    marginLeft: 8,
  },
  datePicker: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderRadius: 8,
    padding: 16,
  },
  yearSelector: {
    marginBottom: 16,
  },
  yearButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 6,
    backgroundColor: colors.background,
  },
  selectedYearButton: {
    backgroundColor: colors.primary,
  },
  yearButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  selectedYearButtonText: {
    color: colors.white,
    fontWeight: '600',
  },
  monthSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  monthButton: {
    width: (width - 80) / 3,
    paddingVertical: 12,
    marginBottom: 8,
    borderRadius: 6,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  selectedMonthButton: {
    backgroundColor: colors.primary,
  },
  monthButtonText: {
    fontSize: 14,
    color: colors.text,
  },
  selectedMonthButtonText: {
    color: colors.white,
    fontWeight: '600',
  },
  tableContainer: {
    flex: 1,
    padding: 16,
    maxHeight: 400,
  },
  table: {
    backgroundColor: colors.card,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    paddingVertical: 12,
  },
  tableHeaderCell: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableCell: {
    fontSize: 12,
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  dayCell: {
    fontSize: 12,
    color: colors.text,
    textAlign: 'center',
    paddingHorizontal: 4,
    lineHeight: 16,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  noDataRow: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  totalsContainer: {
    padding: 16,
    backgroundColor: colors.card,
    margin: 16,
    borderRadius: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  totalLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  finalTotalRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
    paddingTop: 12,
  },
  finalTotalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  finalTotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
