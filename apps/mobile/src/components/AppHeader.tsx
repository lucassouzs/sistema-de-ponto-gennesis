import React, { useState } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Menu as MenuIcon, ArrowLeft, Bell } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../notifications/NotificationsContext';
import Menu from './Menu';

type AppHeaderProps = {
  showBack?: boolean;
  onBack?: () => void;
  /** Título centralizado (páginas fora da tab bar) */
  title?: string;
  /** Substitui o sino de notificações (ex.: trocar quadro) */
  rightAction?: React.ReactNode;
};

function HeaderIconButton({
  onPress,
  accessibilityLabel,
  children,
}: {
  onPress?: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel={accessibilityLabel}
      style={styles.iconBtn}
      activeOpacity={0.7}
    >
      {children}
    </TouchableOpacity>
  );
}

function NotificationBell({ iconColor }: { iconColor: string }) {
  const { unreadCount, openSheet } = useNotifications();
  const badge = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <HeaderIconButton onPress={openSheet} accessibilityLabel="Notificações">
      <View style={styles.bellWrap}>
        <Bell size={22} color={iconColor} strokeWidth={2.1} />
        {unreadCount > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
    </HeaderIconButton>
  );
}

export default function AppHeader({
  showBack = false,
  onBack,
  title,
  rightAction,
}: AppHeaderProps) {
  const { colors, isDark } = useTheme();
  const [showMenu, setShowMenu] = useState(false);

  const iconColor = colors.text;

  if (showBack) {
    return (
      <SafeAreaView edges={['top']} style={styles.topSafe}>
        <View style={styles.stackHeader}>
          <View style={styles.side}>
            <TouchableOpacity
              onPress={onBack}
              hitSlop={8}
              accessibilityLabel="Voltar"
              style={styles.iconBtn}
              activeOpacity={0.7}
            >
              <ArrowLeft size={24} color={iconColor} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <View style={styles.center} pointerEvents="none">
            {title ? (
              <Text
                style={[styles.stackTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {title}
              </Text>
            ) : null}
          </View>

          <View style={[styles.side, styles.sideRight]}>
            {rightAction ?? <NotificationBell iconColor={iconColor} />}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView edges={['top']} style={styles.topSafe}>
        <View style={styles.header}>
          <View style={styles.side}>
            <HeaderIconButton
              onPress={() => setShowMenu(true)}
              accessibilityLabel="Menu"
            >
              <MenuIcon size={22} color={iconColor} strokeWidth={2.2} />
            </HeaderIconButton>
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
            <NotificationBell iconColor={iconColor} />
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
  },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
    textAlign: 'center',
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
    paddingHorizontal: 4,
  },
  logo: {
    width: 168,
    height: 44,
  },
  bellWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 14,
    height: 14,
    borderRadius: 4,
    paddingHorizontal: 3,
    backgroundColor: '#ce3736',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.16,
        shadowRadius: 1.2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
    letterSpacing: -0.2,
  },
});
