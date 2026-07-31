import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Menu as MenuIcon, ArrowLeft, Bell } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../notifications/NotificationsContext';
import Menu from './Menu';

type AppHeaderProps = {
  showBack?: boolean;
  onBack?: () => void;
  /** Título ao lado do voltar (páginas fora da tab bar) */
  title?: string;
};

function IconChip({
  onPress,
  accessibilityLabel,
  children,
  chipBg,
}: {
  onPress?: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
  chipBg: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={6}
      accessibilityLabel={accessibilityLabel}
      style={[styles.iconChip, { backgroundColor: chipBg }]}
      activeOpacity={0.75}
    >
      {children}
    </TouchableOpacity>
  );
}

function NotificationBell({
  iconColor,
  chipBg,
  withChip,
}: {
  iconColor: string;
  chipBg: string;
  withChip: boolean;
}) {
  const { unreadCount, openSheet } = useNotifications();
  const badge = unreadCount > 9 ? '9+' : String(unreadCount);

  const content = (
    <View>
      <Bell size={withChip ? 20 : 22} color={iconColor} strokeWidth={2.1} />
      {unreadCount > 0 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );

  if (withChip) {
    return (
      <IconChip onPress={openSheet} accessibilityLabel="Notificações" chipBg={chipBg}>
        {content}
      </IconChip>
    );
  }

  return (
    <TouchableOpacity
      onPress={openSheet}
      hitSlop={8}
      accessibilityLabel="Notificações"
      style={styles.stackRightBtn}
      activeOpacity={0.7}
    >
      {content}
    </TouchableOpacity>
  );
}

export default function AppHeader({ showBack = false, onBack, title }: AppHeaderProps) {
  const { colors, isDark } = useTheme();
  const [showMenu, setShowMenu] = useState(false);

  const iconColor = colors.text;
  const chipBg = colors.card;

  if (showBack) {
    return (
      <SafeAreaView edges={['top']} style={styles.topSafe}>
        <View style={styles.stackHeader}>
          <TouchableOpacity
            onPress={onBack}
            hitSlop={8}
            accessibilityLabel="Voltar"
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <ArrowLeft size={24} color={iconColor} strokeWidth={2.2} />
          </TouchableOpacity>

          {title ? (
            <Text style={[styles.stackTitle, { color: colors.text }]} numberOfLines={1}>
              {title}
            </Text>
          ) : (
            <View style={styles.stackTitleSpacer} />
          )}

          <NotificationBell iconColor={iconColor} chipBg={chipBg} withChip={false} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView edges={['top']} style={styles.topSafe}>
        <View style={styles.header}>
          <View style={styles.side}>
            <IconChip
              onPress={() => setShowMenu(true)}
              accessibilityLabel="Menu"
              chipBg={chipBg}
            >
              <MenuIcon size={22} color={iconColor} strokeWidth={2.2} />
            </IconChip>
          </View>

          <View style={styles.center} pointerEvents="none">
            <Image
              source={
                isDark
                  ? require('../../assets/logobrancavermelha.png')
                  : require('../../assets/logo.png')
              }
              style={styles.logo}
              resizeMode="contain"
            />
          </View>

          <View style={[styles.side, styles.sideRight]}>
            <NotificationBell iconColor={iconColor} chipBg={chipBg} withChip />
          </View>
        </View>
      </SafeAreaView>

      <Menu visible={showMenu} onClose={() => setShowMenu(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  topSafe: {
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 10,
    minHeight: 56,
    backgroundColor: 'transparent',
  },
  stackHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 8,
    minHeight: 52,
    gap: 4,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  stackTitleSpacer: {
    flex: 1,
  },
  stackRightBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  side: {
    width: 48,
    alignItems: 'flex-start',
    justifyContent: 'center',
    zIndex: 2,
  },
  sideRight: { alignItems: 'flex-end' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 168,
    height: 44,
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: '#ce3736',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 11,
  },
});
