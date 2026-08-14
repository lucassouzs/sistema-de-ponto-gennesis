import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Animated,
  Easing,
  TouchableWithoutFeedback,
  Alert,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Home,
  Moon,
  Sun,
  LogOut,
  ClipboardList,
  Calendar,
  LayoutGrid,
  Wrench,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { openFavoriteKanbanBoard } from '../lib/openFavoriteKanbanBoard';
import type { RootStackParamList } from '../../App';

interface MenuProps {
  visible: boolean;
  onClose: () => void;
}

const PANEL_WIDTH = Math.min(320, Dimensions.get('window').width * 0.78);

function MenuItemRow({
  label,
  icon: Icon,
  color,
  onPress,
  anim,
  index,
}: {
  label: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  color: string;
  onPress: () => void;
  anim: Animated.Value;
  index: number;
}) {
  // Cada item entra um pouco depois do anterior.
  const start = Math.min(0.12 * index, 0.55);
  const opacity = anim.interpolate({
    inputRange: [start, Math.min(start + 0.35, 1)],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const translateX = anim.interpolate({
    inputRange: [start, Math.min(start + 0.35, 1)],
    outputRange: [-16, 0],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={{ opacity, transform: [{ translateX }] }}>
      <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.65}>
        <Icon size={20} color={color} strokeWidth={2} />
        <Text style={[styles.itemLabel, { color }]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function Menu({ visible, onClose }: MenuProps) {
  const { colors, isDark, toggleTheme } = useTheme();
  const { logout, user } = useAuth();
  const { canSeePncp, canSeeGestaoOs } = usePermissions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();

  const slideAnim = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const itemsAnim = useRef(new Animated.Value(0)).current;
  const [isVisible, setIsVisible] = useState(false);

  const closeThen = useCallback(
    (action: () => void) => {
      onClose();
      setTimeout(action, 230);
    },
    [onClose],
  );

  const go = useCallback(
    (name: keyof RootStackParamList | 'Home') => {
      closeThen(() => {
        if (name === 'Home') {
          (navigation as any).navigate('Main', { screen: 'Home' });
          return;
        }
        navigation.navigate(name as never);
      });
    },
    [closeThen, navigation],
  );

  const links = [
    { key: 'home', label: 'Início', icon: Home, onPress: () => go('Home') },
    { key: 'agenda', label: 'Agenda', icon: Calendar, onPress: () => go('Agenda') },
    {
      key: 'tasks',
      label: 'Tasks',
      icon: LayoutGrid,
      onPress: () => {
        closeThen(() => {
          void openFavoriteKanbanBoard(navigation, user?.id, queryClient);
        });
      },
    },
    ...(canSeePncp
      ? [{ key: 'pncp', label: 'Licitações PNCP', icon: ClipboardList, onPress: () => go('Pncp') }]
      : []),
    ...(canSeeGestaoOs
      ? [{ key: 'gestao-os', label: 'Central de Chamados', icon: Wrench, onPress: () => go('GestaoOs') }]
      : []),
  ];

  useEffect(() => {
    if (visible) {
      setIsVisible(true);
      slideAnim.setValue(-PANEL_WIDTH);
      overlayOpacity.setValue(0);
      itemsAnim.setValue(0);

      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          damping: 22,
          stiffness: 220,
          mass: 0.9,
          useNativeDriver: true,
        }),
        Animated.timing(itemsAnim, {
          toValue: 1,
          duration: 420,
          delay: 60,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -PANEL_WIDTH,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(itemsAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setIsVisible(false);
    });
  }, [visible, overlayOpacity, slideAnim, itemsAnim]);

  const handleLogout = () => {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => {
          closeThen(() => {
            void logout();
          });
        },
      },
    ]);
  };

  const headerOpacity = itemsAnim.interpolate({
    inputRange: [0, 0.4],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const headerShift = itemsAnim.interpolate({
    inputRange: [0, 0.4],
    outputRange: [-10, 0],
    extrapolate: 'clamp',
  });

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.panel,
            {
              width: PANEL_WIDTH,
              backgroundColor: colors.background,
              paddingTop: insets.top,
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateX: slideAnim }],
            },
          ]}
        >
          <Animated.View
            style={[
              styles.header,
              { opacity: headerOpacity, transform: [{ translateX: headerShift }] },
            ]}
          >
            <Text style={[styles.title, { color: colors.text }]}>Menu</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <X size={22} color={colors.text} strokeWidth={2} />
            </TouchableOpacity>
          </Animated.View>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.contentInner}
          >
            {links.map((item, index) => (
              <MenuItemRow
                key={item.key}
                label={item.label}
                icon={item.icon}
                color={colors.text}
                onPress={item.onPress}
                anim={itemsAnim}
                index={index}
              />
            ))}
          </ScrollView>

          <Animated.View
            style={[
              styles.footer,
              {
                borderTopColor: colors.border,
                opacity: headerOpacity,
                transform: [{ translateY: headerShift }],
              },
            ]}
          >
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
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  panel: {
    height: '100%',
    maxWidth: 320,
    paddingHorizontal: 20,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 12,
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
