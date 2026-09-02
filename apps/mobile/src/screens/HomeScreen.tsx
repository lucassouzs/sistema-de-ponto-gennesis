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
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import UserAvatar from '../components/UserAvatar';
import LiveActivitySection from '../components/LiveActivitySection';
import HomeAgendaCard from '../components/HomeAgendaCard';
import HomeTarefasCard from '../components/HomeTarefasCard';
import PncpCaptacoesCard from '../components/PncpCaptacoesCard';
import { useLiveActivities, LiveActivity } from '../hooks/useLiveActivities';
import { usePermissions } from '../hooks/usePermissions';
import type { RootStackParamList } from '../../App';

function greetingPrefix() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { canSeeCombustivel, canSeeReservas, canSeePncp } = usePermissions();
  const { items: liveItems } = useLiveActivities();
  const styles = getStyles(colors, isDark);

  const firstName = user?.name?.trim().split(/\s+/)[0] || 'colaborador';

  const goProfile = () => {
    (navigation as any).navigate('Profile');
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

        <LiveActivitySection items={liveItems} onPress={openLiveActivity} />

        <HomeAgendaCard />

        <HomeTarefasCard />

        {canSeePncp ? <PncpCaptacoesCard /> : null}
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any, _isDark: boolean) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.screenRoot },
    container: { flex: 1, backgroundColor: colors.screenRoot },
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
  });
