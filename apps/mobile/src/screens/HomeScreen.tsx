import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Droplets, CalendarCheck } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import UserAvatar from '../components/UserAvatar';
import LiveActivitySection from '../components/LiveActivitySection';
import PncpCaptacoesCard from '../components/PncpCaptacoesCard';
import { useLiveActivities, LiveActivity } from '../hooks/useLiveActivities';
import { usePermissions } from '../hooks/usePermissions';

function greetingPrefix() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { canSeeCombustivel, canSeeReservas, canSeePncp } = usePermissions();
  const { items: liveItems } = useLiveActivities();
  const styles = getStyles(colors, isDark);

  const firstName = user?.name?.trim().split(/\s+/)[0] || 'colaborador';
  const showHero = canSeeCombustivel || canSeeReservas;

  const goTab = (name: 'Combustivel' | 'Reservas') => {
    navigation.navigate(name);
  };

  const goProfile = () => {
    navigation.navigate('Profile');
  };

  const openLiveActivity = (item: LiveActivity) => {
    if (item.kind === 'fuel') {
      if (canSeeCombustivel) navigation.navigate('Combustivel');
      return;
    }
    if (canSeeReservas) navigation.navigate('Reservas');
  };

  return (
    <View style={styles.safeArea}>
      <AppHeader />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.greetingRow}>
          <View style={styles.greetingTextWrap}>
            <Text style={styles.greetingEyebrow}>{greetingPrefix()},</Text>
            <Text style={styles.greetingName} numberOfLines={1}>
              {firstName}!
            </Text>
          </View>
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={goProfile}
            activeOpacity={0.8}
            accessibilityLabel="Abrir perfil"
          >
            <UserAvatar
              uri={user?.profilePhotoUrl}
              size={48}
              backgroundColor={colors.primary}
              iconColor="#fff"
            />
          </TouchableOpacity>
        </View>

        <LiveActivitySection items={liveItems} onPress={openLiveActivity} />

        {canSeePncp ? <PncpCaptacoesCard /> : null}

        {showHero ? (
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>Frota Gennesis</Text>
            <Text style={styles.heroTitle}>
              {canSeeCombustivel && canSeeReservas
                ? 'Combustível e reservas em um só lugar'
                : canSeeCombustivel
                  ? 'Abasteça com praticidade'
                  : 'Reserve veículos com praticidade'}
            </Text>
            <Text style={styles.heroSubtitle}>
              {canSeeCombustivel && canSeeReservas
                ? 'Solicite abastecimento e reserve veículos pelo app.'
                : canSeeCombustivel
                  ? 'Solicite abastecimento de forma rápida pelo app.'
                  : 'Reserve veículos de forma rápida pelo app.'}
            </Text>
            <View style={styles.heroActions}>
              {canSeeCombustivel ? (
                <TouchableOpacity
                  style={styles.heroCta}
                  onPress={() => goTab('Combustivel')}
                  activeOpacity={0.85}
                >
                  <Droplets size={18} color={colors.primary} strokeWidth={2.4} />
                  <Text style={styles.heroCtaText}>Combustível</Text>
                </TouchableOpacity>
              ) : null}
              {canSeeReservas ? (
                <TouchableOpacity
                  style={canSeeCombustivel ? styles.heroCtaSecondary : styles.heroCta}
                  onPress={() => goTab('Reservas')}
                  activeOpacity={0.85}
                >
                  <CalendarCheck
                    size={18}
                    color={canSeeCombustivel ? '#fff' : colors.primary}
                    strokeWidth={2.4}
                  />
                  <Text
                    style={
                      canSeeCombustivel ? styles.heroCtaSecondaryText : styles.heroCtaText
                    }
                  >
                    Reservas
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any, _isDark: boolean) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1, backgroundColor: colors.background },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 120,
    },
    greetingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 18,
    },
    greetingTextWrap: { flex: 1, minWidth: 0 },
    greetingEyebrow: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 2,
    },
    greetingName: {
      fontSize: 28,
      fontWeight: '700',
      letterSpacing: -0.6,
      color: colors.text,
    },
    avatarBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      overflow: 'hidden',
    },
    hero: {
      backgroundColor: colors.primary,
      borderRadius: 22,
      padding: 20,
      marginBottom: 18,
    },
    heroEyebrow: {
      color: 'rgba(255,255,255,0.78)',
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 8,
    },
    heroTitle: {
      color: '#fff',
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.4,
      marginBottom: 8,
    },
    heroSubtitle: {
      color: 'rgba(255,255,255,0.88)',
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '500',
      marginBottom: 16,
    },
    heroActions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    heroCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#fff',
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 999,
    },
    heroCtaText: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 14,
    },
    heroCtaSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(255,255,255,0.16)',
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: 'rgba(255,255,255,0.35)',
    },
    heroCtaSecondaryText: {
      color: '#fff',
      fontWeight: '700',
      fontSize: 14,
    },
  });
