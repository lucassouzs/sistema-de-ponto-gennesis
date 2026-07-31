import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  TouchableWithoutFeedback,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Droplets,
  CalendarCheck,
  Home,
  User,
  Moon,
  Sun,
  LogOut,
  ClipboardList,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import type { RootStackParamList } from '../../App';

interface MenuProps {
  visible: boolean;
  onClose: () => void;
}

export default function Menu({ visible, onClose }: MenuProps) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { logout } = useAuth();
  const { canSeeCombustivel, canSeeReservas, canSeePncp } = usePermissions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const slideAnim = React.useRef(new Animated.Value(-300)).current;
  const overlayOpacity = React.useRef(new Animated.Value(0)).current;
  const [isVisible, setIsVisible] = React.useState(false);

  React.useEffect(() => {
    if (visible) {
      setIsVisible(true);
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: -300,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => setIsVisible(false));
    }
  }, [visible, overlayOpacity, slideAnim]);

  const go = (name: keyof RootStackParamList | 'Home' | 'Combustivel' | 'Reservas' | 'Pncp') => {
    onClose();
    setTimeout(() => {
      if (name === 'Home' || name === 'Combustivel' || name === 'Reservas' || name === 'Pncp') {
        navigation.navigate('Main' as never, { screen: name } as never);
        return;
      }
      navigation.navigate(name as never);
    }, 200);
  };

  const handleLogout = () => {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => {
          onClose();
          setTimeout(() => {
            void logout();
          }, 200);
        },
      },
    ]);
  };

  const styles = getStyles(colors);

  const links = [
    { key: 'home', label: 'Início', icon: Home, onPress: () => go('Home') },
    ...(canSeeCombustivel
      ? [{ key: 'fuel', label: 'Combustível', icon: Droplets, onPress: () => go('Combustivel') }]
      : []),
    ...(canSeeReservas
      ? [
          {
            key: 'reservas',
            label: 'Reservas',
            icon: CalendarCheck,
            onPress: () => go('Reservas'),
          },
        ]
      : []),
    ...(canSeePncp
      ? [{ key: 'pncp', label: 'Licitações PNCP', icon: ClipboardList, onPress: () => go('Pncp') }]
      : []),
    { key: 'profile', label: 'Perfil', icon: User, onPress: () => go('Profile') },
  ];

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Animated.View
            style={[
              styles.panel,
              {
                backgroundColor: colors.background,
                paddingTop: insets.top,
                paddingBottom: Math.max(insets.bottom, 16),
                transform: [{ translateX: slideAnim }],
              },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.header}>
              <Text style={[styles.title, { color: colors.text }]}>Menu</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                <X size={22} color={colors.text} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.contentInner}
            >
              {links.map((item) => {
                const Icon = item.icon;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={styles.item}
                    onPress={item.onPress}
                    activeOpacity={0.65}
                  >
                    <Icon size={20} color={colors.text} strokeWidth={2} />
                    <Text style={[styles.itemLabel, { color: colors.text }]}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={[styles.footer, { borderTopColor: colors.border }]}>
              <TouchableOpacity style={styles.themeRow} onPress={toggleTheme} activeOpacity={0.65}>
                {isDark ? (
                  <Sun size={20} color={colors.text} strokeWidth={2} />
                ) : (
                  <Moon size={20} color={colors.text} strokeWidth={2} />
                )}
                <Text style={[styles.itemLabel, { color: colors.text }]}>
                  {isDark ? 'Tema claro' : 'Tema escuro'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.themeRow} onPress={handleLogout} activeOpacity={0.65}>
                <LogOut size={20} color={colors.primary} strokeWidth={2} />
                <Text style={[styles.itemLabel, { color: colors.primary }]}>Sair</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Animated.View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const getStyles = (colors: any) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      flexDirection: 'row',
    },
    panel: {
      width: '78%',
      maxWidth: 320,
      height: '100%',
      paddingHorizontal: 20,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
      paddingHorizontal: 4,
      height: 44,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.4,
    },
    closeBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    content: { flex: 1 },
    contentInner: { paddingBottom: 16 },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 14,
      paddingHorizontal: 4,
    },
    itemLabel: {
      fontSize: 16,
      fontWeight: '500',
      letterSpacing: -0.2,
    },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: 8,
      gap: 4,
    },
    themeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 14,
      paddingHorizontal: 4,
    },
  });
