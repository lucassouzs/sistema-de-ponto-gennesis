import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, NavigationProp, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Clock, Eye, LogIn, Utensils, RotateCw, LogOut, Menu, Plus, Moon, Sun } from 'lucide-react-native';
import MenuComponent from '../components/Menu';
import api from '../services/api';

type RootStackParamList = {
  Main: undefined;
  Punch: undefined;
  TimeRecords: undefined;
};

type TimeRecord = {
  id: string;
  type: string;
  timestamp: string;
  observation?: string;
};

export default function DashboardScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { user, logout } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const [todayRecords, setTodayRecords] = useState<TimeRecord[]>([]);
  const [todaySummary, setTodaySummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  
  const styles = getStyles(colors);

  useEffect(() => {
    fetchTodayRecords();
  }, []);

  // Atualizar ao voltar para a tela
  useFocusEffect(
    React.useCallback(() => {
      fetchTodayRecords();
    }, [])
  );

  const fetchTodayRecords = async () => {
    try {
      const response = await api.get('/api/time-records/my-records/today');

      if (response.ok) {
        const data = await response.json();
        const records = data.data?.records || [];
        const summary = data.data?.summary || null;
        setTodayRecords(records);
        setTodaySummary(summary);
      }
    } catch (error) {
      console.error('Erro ao buscar registros de hoje:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchTodayRecords();
  };

  const handleLogout = () => {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', onPress: logout },
    ]);
  };

  const getTypeLabel = (type: string) => {
    const types = {
      ENTRY: 'Entrada',
      EXIT: 'Saída',
      LUNCH_START: 'Almoço',
      LUNCH_END: 'Retorno',
    };
    return types[type as keyof typeof types] || type;
  };

  const getTypeIcon = (type: string) => {
    const icons = {
      ENTRY: LogIn,
      EXIT: LogOut,
      LUNCH_START: Utensils,
      LUNCH_END: RotateCw,
    };
    return icons[type as keyof typeof icons] || Clock;
  };

  const formatTime = (timestamp: string) => {
    // Banco salva horário em UTC
    // Usar getUTCHours/Minutes/Seconds para ler o valor correto
    const date = new Date(timestamp);
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  };

  const formatDate = () => {
    const date = new Date();
    const formattedDate = date.toLocaleDateString('pt-BR', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric',
    });
    // Capitalizar apenas a primeira letra
    return formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
  };

  const getFirstName = () => {
    if (!user?.name) return '';
    return user.name.split(' ')[0];
  };

  // Estrutura dos pontos do dia
  const allPunchTypes = [
    { type: 'ENTRY', label: 'Entrada', icon: LogIn },
    { type: 'LUNCH_START', label: 'Almoço', icon: Utensils },
    { type: 'LUNCH_END', label: 'Retorno', icon: RotateCw },
    { type: 'EXIT', label: 'Saída', icon: LogOut },
  ];

  const punchRecordsDisplay = allPunchTypes.map(punchType => {
    const record = todayRecords.find(r => r.type === punchType.type);
    return {
      ...punchType,
      time: record ? formatTime(record.timestamp) : '--:--:--',
    };
  });

  // Determina o próximo tipo de ponto
  const getNextPunchType = () => {
    const hasEntry = todayRecords.some(r => r.type === 'ENTRY');
    const hasLunchStart = todayRecords.some(r => r.type === 'LUNCH_START');
    const hasLunchEnd = todayRecords.some(r => r.type === 'LUNCH_END');
    const hasExit = todayRecords.some(r => r.type === 'EXIT');

    if (!hasEntry) return 'ENTRADA';
    if (!hasLunchStart) return 'ALMOÇO';
    if (!hasLunchEnd) return 'RETORNO';
    if (!hasExit) return 'SAÍDA';
    return 'COMPLETO';
  };

  // Verifica se todos os pontos foram batidos
  const allPointsCompleted = () => {
    return getNextPunchType() === 'COMPLETO';
  };

  // Formata as horas trabalhadas (descontando almoço)
  const formatWorkedHours = () => {
    if (!todaySummary) {
      return '--:--:--';
    }
    
    // Calcular horas efetivas: totalHours - lunchHours
    const effectiveHours = (todaySummary.totalHours || 0) - (todaySummary.lunchHours || 0);
    
    if (effectiveHours <= 0) {
      return '--:--:--';
    }
    
    const hours = Math.floor(effectiveHours);
    const remainingMinutes = (effectiveHours - hours) * 60;
    const minutes = Math.floor(remainingMinutes);
    const seconds = Math.round((remainingMinutes - minutes) * 60);
    
    // Formatar como HH:MM:SS
    const hoursStr = hours.toString().padStart(2, '0');
    const minutesStr = minutes.toString().padStart(2, '0');
    const secondsStr = seconds.toString().padStart(2, '0');
    
    return `${hoursStr}:${minutesStr}:${secondsStr}`;
  };

  const menuItems: any[] = [];

  return (
    <View style={styles.safeArea}>
      <SafeAreaView edges={['top']} style={styles.topSafeArea} />
      
      {/* Top bar fixo com logo e menu */}
      <View style={styles.fixedTopBar}>
        <TouchableOpacity 
          style={styles.menuButton}
          onPress={() => setShowMenu(true)}
        >
          <Menu size={28} color={colors.headerText} strokeWidth={2} />
        </TouchableOpacity>
        <Image 
          source={require('../../assets/logobranca.png')} 
          style={styles.logoImage}
          resizeMode="contain"
        />
        <TouchableOpacity 
          style={styles.themeButton}
          onPress={toggleTheme}
        >
          {isDark ? (
            <Sun size={28} color={colors.headerText} strokeWidth={2} />
          ) : (
            <Moon size={28} color={colors.headerText} strokeWidth={2} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.welcomeContainer}>
            <Text style={styles.welcomeText}>Olá,</Text>
            <Text style={styles.userName}>{getFirstName()}!</Text>
          </View>
          
          {/* Botão de Registrar Ponto */}
          <TouchableOpacity
            style={[
              styles.mainActionButton,
              allPointsCompleted() && styles.mainActionButtonCompleted
            ]}
            onPress={() => !allPointsCompleted() && navigation.navigate('Punch')}
            activeOpacity={allPointsCompleted() ? 1 : 0.9}
            disabled={allPointsCompleted()}
          >
            <View style={styles.buttonContent}>
              <View style={styles.buttonTextContainer}>
                <Text style={[
                  styles.buttonTitle,
                  allPointsCompleted() && styles.buttonTitleCompleted
                ]}>
                  {allPointsCompleted() ? 'TOTAL TRABALHADO' : 'PRÓXIMO PONTO'}
                </Text>
                <Text style={[
                  styles.buttonSubtitle,
                  allPointsCompleted() && styles.buttonSubtitleCompleted
                ]}>
                  {allPointsCompleted() ? formatWorkedHours() : getNextPunchType()}
                </Text>
              </View>
              {allPointsCompleted() ? (
                <Clock size={28} color={colors.primary} strokeWidth={2.5} />
              ) : (
                <Plus size={28} color={colors.primary} strokeWidth={2.5} />
              )}
            </View>
          </TouchableOpacity>
        </View>

        {/* Registros de Hoje */}
        <View style={styles.todaySection}>
          <View style={styles.titleContainer}>
            <Text style={styles.recordsTitle}>Registros</Text>
            <Text style={styles.dateSubtitle}>
              {formatDate()}
            </Text>
          </View>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : (
            <View style={styles.recordsGrid}>
              {punchRecordsDisplay.map((punch, index) => {
                const IconComponent = punch.icon;
                return (
                  <View key={index} style={styles.recordCard}>
                    <View style={styles.recordIcon}>
                      <IconComponent size={26} color={colors.primary} />
                    </View>
                    <Text style={styles.recordLabel}>
                      {punch.label}
                    </Text>
                    <Text style={[
                      styles.recordTime,
                      punch.time === '--:--:--' && styles.recordTimeEmpty
                    ]}>
                      {punch.time}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
          
          {/* Botão Ver Mais */}
          <TouchableOpacity
            style={styles.seeMoreButton}
            onPress={() => navigation.navigate('TimeRecords')}
          >
            <Eye size={18} color={colors.primary} />
            <Text style={styles.seeMoreText}>Ver mais</Text>
          </TouchableOpacity>
        </View>

        {/* Menu */}
        {menuItems.length > 0 && (
          <View style={styles.menuContainer}>
            <Text style={styles.sectionTitle}>Menu</Text>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={styles.menuItem}
                onPress={item.onPress}
              >
                <View style={styles.menuItemLeft}>
                  <View style={styles.iconContainer}>{item.icon}</View>
                  <View>
                    <Text style={styles.menuItemTitle}>{item.title}</Text>
                    <Text style={styles.menuItemSubtitle}>{item.subtitle}</Text>
                  </View>
                </View>
                <Text style={styles.menuItemArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Menu Component */}
      <MenuComponent
        visible={showMenu}
        onClose={() => setShowMenu(false)}
      />
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
  fixedTopBar: {
    backgroundColor: colors.headerBackground,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 10,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    backgroundColor: colors.headerBackground,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 6,
  },
  logoImage: {
    width: 160,
    height: 50,
  },
  menuButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  themeButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholder: {
    width: 44,
    height: 44,
  },
  welcomeContainer: {
    marginBottom: 20,
  },
  welcomeText: {
    fontSize: 20,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  userName: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.headerText,
    letterSpacing: -0.8,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  logoutButton: {
    padding: 8,
  },
  actionSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: '#f9fafb',
  },
  mainActionButton: {
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 24,
  },
  mainActionButtonCompleted: {
    backgroundColor: colors.card,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  buttonTextContainer: {
    flex: 1,
  },
  buttonTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  buttonSubtitle: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  buttonTitleCompleted: {
    color: colors.text,
  },
  buttonSubtitleCompleted: {
    color: colors.primary,
  },
  mainActionText: {
    color: colors.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
    marginLeft: 4,
  },
  menuContainer: {
    paddingHorizontal: 20,
    paddingBottom: 30,
    backgroundColor: '#f9fafb',
  },
  menuItem: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  menuItemSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  menuItemArrow: {
    fontSize: 22,
    color: '#9ca3af',
  },
  todaySection: {
    paddingHorizontal: 20,
    paddingTop: 25,
    paddingBottom: 25,
    backgroundColor: colors.background,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  recordsTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  dateSubtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 30,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#9ca3af',
  },
  recordsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  recordCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 25,
    padding: 14,
    alignItems: 'center',
    elevation: 0,
  },
  recordIcon: {
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  recordTime: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  recordTimeEmpty: {
    color: colors.textSecondary,
  },
  seeMoreButton: {
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
    marginTop: 20,
  },
  seeMoreText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
});
