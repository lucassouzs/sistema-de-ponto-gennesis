import React, { useState } from 'react';
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Menu as MenuIcon, Moon, Sun, ArrowLeft } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import Menu from './Menu';

type AppHeaderProps = {
  showBack?: boolean;
  onBack?: () => void;
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

export default function AppHeader({ showBack = false, onBack }: AppHeaderProps) {
  const { colors, isDark, toggleTheme } = useTheme();
  const [showMenu, setShowMenu] = useState(false);

  const iconColor = colors.text;
  const chipBg = colors.card;

  return (
    <>
      <SafeAreaView edges={['top']} style={styles.topSafe}>
        <View style={styles.header}>
          <View style={styles.side}>
            {showBack ? (
              <IconChip onPress={onBack} accessibilityLabel="Voltar" chipBg={chipBg}>
                <ArrowLeft size={22} color={iconColor} strokeWidth={2.2} />
              </IconChip>
            ) : (
              <IconChip
                onPress={() => setShowMenu(true)}
                accessibilityLabel="Menu"
                chipBg={chipBg}
              >
                <MenuIcon size={22} color={iconColor} strokeWidth={2.2} />
              </IconChip>
            )}
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
            <IconChip onPress={toggleTheme} accessibilityLabel="Alternar tema" chipBg={chipBg}>
              {isDark ? (
                <Sun size={20} color={iconColor} strokeWidth={2} />
              ) : (
                <Moon size={20} color={iconColor} strokeWidth={2} />
              )}
            </IconChip>
          </View>
        </View>
      </SafeAreaView>

      {!showBack ? (
        <Menu visible={showMenu} onClose={() => setShowMenu(false)} />
      ) : null}
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
});
