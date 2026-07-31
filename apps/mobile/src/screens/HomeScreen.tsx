import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  Droplets,
  CalendarCheck,
  User,
  ChevronRight,
  ClipboardList,
} from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import LiveActivitySection from '../components/LiveActivitySection';
import { useLiveActivities, LiveActivity } from '../hooks/useLiveActivities';

type ShortcutKey = 'all' | 'combustivel' | 'reservas' | 'pncp';

type QuickAction = {
  key: string;
  group: Exclude<ShortcutKey, 'all'> | 'perfil';
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress: () => void;
};

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
  const [filter, setFilter] = useState<ShortcutKey>('all');
  const { items: liveItems } = useLiveActivities();
  const styles = getStyles(colors, isDark);

  const firstName = user?.name?.trim().split(/\s+/)[0] || 'colaborador';

  const goTab = (name: 'Combustivel' | 'Reservas' | 'Pncp') => {
    navigation.navigate(name);
  };

  const goProfile = () => {
    navigation.navigate('Profile');
  };

  const openLiveActivity = (item: LiveActivity) => {
    if (item.kind === 'fuel') {
      navigation.navigate('Combustivel');
      return;
    }
    navigation.navigate('Reservas');
  };

  const actions: QuickAction[] = useMemo(
    () => [
      {
        key: 'fuel',
        group: 'combustivel',
        title: 'Combustível',
        description: 'Solicitar ou acompanhar abastecimento',
        icon: Droplets,
        onPress: () => goTab('Combustivel'),
      },
      {
        key: 'vehicles',
        group: 'reservas',
        title: 'Reserva de veículo',
        description: 'Solicitar e gerenciar reservas',
        icon: CalendarCheck,
        onPress: () => goTab('Reservas'),
      },
      {
        key: 'pncp',
        group: 'pncp',
        title: 'Licitações PNCP',
        description: 'Consultar e enviar para análise',
        icon: ClipboardList,
        onPress: () => goTab('Pncp'),
      },
      {
        key: 'profile',
        group: 'perfil',
        title: 'Meu perfil',
        description: 'Dados pessoais e da empresa',
        icon: User,
        onPress: goProfile,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const chips: { key: ShortcutKey; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'combustivel', label: 'Combustível' },
    { key: 'reservas', label: 'Reservas' },
    { key: 'pncp', label: 'PNCP' },
  ];

  const visibleActions =
    filter === 'all' ? actions : actions.filter((item) => item.group === filter);

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
            <User size={22} color="#fff" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        <LiveActivitySection items={liveItems} onPress={openLiveActivity} />

        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>Frota Gennesis</Text>
          <Text style={styles.heroTitle}>Combustível e reservas em um só lugar</Text>
          <Text style={styles.heroSubtitle}>
            Solicite abastecimento e reserve veículos de forma rápida pelo app.
          </Text>
          <View style={styles.heroActions}>
            <TouchableOpacity
              style={styles.heroCta}
              onPress={() => goTab('Combustivel')}
              activeOpacity={0.85}
            >
              <Droplets size={18} color={colors.primary} strokeWidth={2.4} />
              <Text style={styles.heroCtaText}>Combustível</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.heroCtaSecondary}
              onPress={() => goTab('Reservas')}
              activeOpacity={0.85}
            >
              <CalendarCheck size={18} color="#fff" strokeWidth={2.4} />
              <Text style={styles.heroCtaSecondaryText}>Reservas</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {chips.map(({ key, label }) => {
            const active = filter === key;
            return (
              <TouchableOpacity
                key={key}
                onPress={() => setFilter(key)}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionTitle}>Acesso rápido</Text>

        <View style={styles.list}>
          {visibleActions.map((item) => {
            const Icon = item.icon;
            return (
              <TouchableOpacity
                key={item.key}
                style={styles.card}
                onPress={item.onPress}
                activeOpacity={0.8}
              >
                <View style={styles.cardIcon}>
                  <Icon size={22} color={colors.primary} strokeWidth={2.1} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardDescription}>{item.description}</Text>
                </View>
                <ChevronRight size={18} color={colors.textSecondary} strokeWidth={2.2} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
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
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
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
      fontSize: 14,
      fontWeight: '700',
    },
    heroCtaSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(255,255,255,0.16)',
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255,255,255,0.35)',
    },
    heroCtaSecondaryText: {
      color: '#fff',
      fontSize: 14,
      fontWeight: '700',
    },
    chipsRow: {
      gap: 8,
      paddingBottom: 4,
      marginBottom: 18,
    },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? colors.border : 'transparent',
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    chipTextActive: { color: '#fff' },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.3,
      color: colors.text,
      marginBottom: 12,
    },
    list: { gap: 10 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? colors.border : 'rgba(15,23,42,0.06)',
    },
    cardIcon: {
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(239,68,68,0.14)' : colors.iconBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { flex: 1, minWidth: 0 },
    cardTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.2,
      marginBottom: 2,
    },
    cardDescription: {
      fontSize: 12.5,
      fontWeight: '500',
      color: colors.textSecondary,
      lineHeight: 17,
    },
  });
