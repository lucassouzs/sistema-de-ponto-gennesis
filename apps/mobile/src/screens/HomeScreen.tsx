import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { LayoutGrid } from 'lucide-react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import UserAvatar from '../components/UserAvatar';
import LiveActivitySection from '../components/LiveActivitySection';
import HomeAgendaCard from '../components/HomeAgendaCard';
import PncpCaptacoesCard from '../components/PncpCaptacoesCard';
import { useLiveActivities, LiveActivity } from '../hooks/useLiveActivities';
import { usePermissions } from '../hooks/usePermissions';
import { openFavoriteKanbanBoard } from '../lib/openFavoriteKanbanBoard';
import type { RootStackParamList } from '../../App';

function greetingPrefix() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { canSeeCombustivel, canSeeReservas, canSeePncp } = usePermissions();
  const { items: liveItems } = useLiveActivities();
  const styles = getStyles(colors, isDark);

  const firstName = user?.name?.trim().split(/\s+/)[0] || 'colaborador';

  const goProfile = () => {
    (navigation as any).navigate('Profile');
  };

  const openTasks = () => {
    void openFavoriteKanbanBoard(navigation as any, user?.id, queryClient);
  };

  const openLiveActivity = (item: LiveActivity) => {
    if (item.kind === 'fuel') {
      if (canSeeCombustivel) (navigation as any).navigate('Combustivel');
      return;
    }
    if (canSeeReservas) (navigation as any).navigate('Reservas');
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

        <View style={styles.quickRow}>
          <TouchableOpacity
            style={styles.quickCard}
            onPress={openTasks}
            activeOpacity={0.75}
          >
            <View style={styles.quickIconWrap}>
              <LayoutGrid size={20} color={colors.primary} strokeWidth={2.2} />
            </View>
            <Text style={styles.quickTitle} numberOfLines={1}>
              Tasks
            </Text>
          </TouchableOpacity>
        </View>

        <LiveActivitySection items={liveItems} onPress={openLiveActivity} />

        <HomeAgendaCard />

        {canSeePncp ? <PncpCaptacoesCard /> : null}
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
    quickRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    quickCard: {
      flex: 1,
      maxWidth: '50%',
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingVertical: 16,
      paddingHorizontal: 8,
      gap: 10,
    },
    quickIconWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}14`,
    },
    quickTitle: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      letterSpacing: -0.2,
    },
  });
