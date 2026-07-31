import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  User,
  Mail,
  Briefcase,
  Calendar,
  LogOut,
  MapPin,
  CreditCard,
  ArrowLeft,
  Bell,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../notifications/NotificationsContext';
import UserAvatar from '../components/UserAvatar';

type InfoRow = {
  key: string;
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
};

export default function ProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { colors, isDark } = useTheme();
  const { unreadCount, openSheet } = useNotifications();
  const styles = getStyles(colors, isDark);

  const handleLogout = () => {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', onPress: logout },
    ]);
  };

  const roleLabel = user?.employee?.position || user?.role || 'Colaborador';
  const metaLeft = user?.employee?.department || null;
  const metaRight = user?.employee?.polo || user?.employee?.company || null;

  const rows: InfoRow[] = [];
  if (user?.email) {
    rows.push({ key: 'email', label: 'Email', value: user.email, icon: Mail });
  }
  if (user?.cpf) {
    rows.push({ key: 'cpf', label: 'CPF', value: user.cpf, icon: User });
  }
  if (user?.employee?.birthDate) {
    rows.push({
      key: 'birth',
      label: 'Data de nascimento',
      value: new Date(user.employee.birthDate).toLocaleDateString('pt-BR'),
      icon: Calendar,
    });
  }
  if (user?.employee?.department) {
    rows.push({
      key: 'dept',
      label: 'Setor',
      value: user.employee.department,
      icon: Briefcase,
    });
  }
  if (user?.employee?.employeeId) {
    rows.push({
      key: 'matricula',
      label: 'Matrícula',
      value: user.employee.employeeId,
      icon: CreditCard,
    });
  }
  if (user?.employee?.hireDate) {
    rows.push({
      key: 'hire',
      label: 'Data de admissão',
      value: new Date(user.employee.hireDate).toLocaleDateString('pt-BR'),
      icon: Calendar,
    });
  }
  if (user?.employee?.company) {
    rows.push({
      key: 'company',
      label: 'Empresa',
      value: user.employee.company,
      icon: Briefcase,
    });
  }
  if (user?.employee?.polo) {
    rows.push({
      key: 'polo',
      label: 'Polo',
      value: user.employee.polo,
      icon: MapPin,
    });
  }
  if (user?.employee?.modality) {
    rows.push({
      key: 'modality',
      label: 'Modalidade',
      value: user.employee.modality,
      icon: Briefcase,
    });
  }

  const badge = unreadCount > 9 ? '9+' : String(unreadCount);
  const heroBg = '#ce3736';

  return (
    <View style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: heroBg, paddingTop: insets.top + 6 }]}>
          <View style={styles.heroTop}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.heroIconBtn}
              hitSlop={8}
              accessibilityLabel="Voltar"
            >
              <ArrowLeft size={22} color="#fff" strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.heroTitle}>Perfil</Text>
            <TouchableOpacity
              onPress={openSheet}
              style={styles.heroIconBtn}
              hitSlop={8}
              accessibilityLabel="Notificações"
            >
              <View>
                <Bell size={20} color="#fff" strokeWidth={2.1} />
                {unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={[styles.badgeText, { color: heroBg }]}>{badge}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.heroProfile}>
            <UserAvatar
              uri={user?.profilePhotoUrl}
              size={96}
              backgroundColor="rgba(255,255,255,0.18)"
              iconColor="#fff"
              style={{ marginBottom: 14 }}
            />
            <Text style={styles.name} numberOfLines={2}>
              {user?.name || 'Colaborador'}
            </Text>
            <Text style={styles.role} numberOfLines={1}>
              {roleLabel}
            </Text>
          </View>

          {(metaLeft || metaRight) && (
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue} numberOfLines={1}>
                  {metaLeft || '—'}
                </Text>
                <Text style={styles.statLabel}>Setor</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue} numberOfLines={1}>
                  {metaRight || '—'}
                </Text>
                <Text style={styles.statLabel}>
                  {user?.employee?.polo ? 'Polo' : 'Empresa'}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionTitle}>Informações</Text>
          <View style={styles.infoCard}>
            {rows.length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma informação disponível.</Text>
            ) : (
              rows.map((row, index) => {
                const Icon = row.icon;
                return (
                  <View key={row.key}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.infoItem}>
                      <View style={styles.infoIcon}>
                        <Icon size={18} color={colors.primary} strokeWidth={2} />
                      </View>
                      <View style={styles.infoText}>
                        <Text style={styles.infoLabel}>{row.label}</Text>
                        <Text style={styles.infoValue}>{row.value}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <TouchableOpacity
            style={[styles.logoutButton, { backgroundColor: heroBg }]}
            onPress={handleLogout}
            activeOpacity={0.85}
          >
            <LogOut size={18} color="#fff" strokeWidth={2.2} />
            <Text style={styles.logoutText}>Sair da conta</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingBottom: 40,
      backgroundColor: colors.background,
      flexGrow: 1,
    },
    hero: {
      borderBottomLeftRadius: 36,
      borderBottomRightRadius: 36,
      paddingHorizontal: 16,
      paddingBottom: 22,
      marginBottom: 20,
      overflow: 'hidden',
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    heroIconBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: {
      color: '#fff',
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    badge: {
      position: 'absolute',
      top: -5,
      right: -7,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 3,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      fontSize: 9,
      fontWeight: '800',
      lineHeight: 11,
    },
    heroProfile: {
      alignItems: 'center',
      marginBottom: 18,
    },
    name: {
      color: '#fff',
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.3,
      textAlign: 'center',
      paddingHorizontal: 12,
    },
    role: {
      color: 'rgba(255,255,255,0.88)',
      fontSize: 14,
      fontWeight: '500',
      marginTop: 4,
      textAlign: 'center',
    },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255,255,255,0.28)',
      paddingTop: 14,
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    statValue: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
      marginBottom: 2,
    },
    statLabel: {
      color: 'rgba(255,255,255,0.75)',
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: 'rgba(255,255,255,0.35)',
    },
    body: {
      paddingHorizontal: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
      marginBottom: 12,
    },
    infoCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? colors.border : 'rgba(15,23,42,0.06)',
      marginBottom: 16,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
      padding: 16,
      textAlign: 'center',
    },
    infoItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      gap: 12,
    },
    infoIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(239,68,68,0.14)' : colors.iconBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoText: {
      flex: 1,
      minWidth: 0,
    },
    infoLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
      marginBottom: 2,
    },
    infoValue: {
      fontSize: 15,
      color: colors.text,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? colors.border : 'rgba(15,23,42,0.08)',
      marginLeft: 48,
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 14,
      gap: 8,
    },
    logoutText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },
  });
