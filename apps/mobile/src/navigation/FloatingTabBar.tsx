import React, { useEffect, useRef } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { House, Fuel, CarFront, Inbox, Plus, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { emitFabBarPress, FabBarTabName } from './fabBarEvents';

const BUTTON = 58;
const RADIUS = 20;
const GAP = 10;
const HORIZONTAL_PADDING = 24;
const BOTTOM_PADDING = 18;

const ICONS: Record<string, LucideIcon> = {
  Home: House,
  Combustivel: Fuel,
  Reservas: CarFront,
  DpRequests: Inbox,
  Fuel,
  Vehicle: CarFront,
};

const SHORT_LABELS: Record<string, string> = {
  Home: 'Início',
  Combustivel: 'Abastecimento',
  Reservas: 'Frota',
  DpRequests: 'Solicitações',
  Fuel: 'Abastecimento',
  Vehicle: 'Frota',
};

const FAB_TABS = new Set(['Combustivel', 'Reservas', 'Fuel', 'Vehicle', 'DpRequests']);
const FAB_SHOW_EASE = Easing.bezier(0.22, 1, 0.36, 1);
const FAB_HIDE_EASE = Easing.bezier(0.4, 0, 0.7, 0.2);

function TabIconView({
  Icon,
  focused,
  color,
}: {
  Icon: LucideIcon;
  focused: boolean;
  color: string;
}) {
  return (
    <Icon
      size={focused ? 24 : 22}
      color={color}
      strokeWidth={focused ? 2.4 : 1.85}
    />
  );
}

function GlassFill({ isDark }: { isDark: boolean }) {
  const overlay = isDark ? 'rgba(31, 41, 55, 0.42)' : 'rgba(255, 255, 255, 0.62)';
  if (Platform.OS === 'web') {
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? '#1f2937' : '#FFFFFF' }]}
      />
    );
  }
  return (
    <>
      <BlurView
        pointerEvents="none"
        intensity={Platform.OS === 'ios' ? 48 : 36}
        tint={isDark ? 'dark' : 'light'}
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFillObject}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: overlay }]}
      />
    </>
  );
}

function SquircleButton({
  children,
  focused,
  isDark,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  focused: boolean;
  isDark: boolean;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel: string;
}) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const borderColor = focused
    ? isDark
      ? 'rgba(255,255,255,0.28)'
      : 'rgba(255,255,255,0.95)'
    : isDark
      ? 'rgba(255,255,255,0.14)'
      : 'rgba(255,255,255,0.72)';

  return (
    <Animated.View
      style={[
        styles.shadowWrap,
        {
          shadowOpacity: isDark ? 0.38 : 0.14,
          transform: [{ scale: pressScale }],
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onLongPress={onLongPress}
        onPressIn={() => {
          Animated.timing(pressScale, {
            toValue: 0.92,
            duration: 80,
            useNativeDriver: true,
          }).start();
        }}
        onPressOut={() => {
          Animated.spring(pressScale, {
            toValue: 1,
            friction: 6,
            tension: 180,
            useNativeDriver: true,
          }).start();
        }}
        style={[styles.squircle, { borderColor }]}
      >
        <GlassFill isDark={isDark} />
        <View style={styles.iconWrap}>{children}</View>
      </Pressable>
    </Animated.View>
  );
}

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();

  const activeRoute = state.routes[state.index]?.name ?? '';
  const showFab = FAB_TABS.has(activeRoute);

  const fabPressScale = useRef(new Animated.Value(1)).current;
  const fabSlot = useRef(new Animated.Value(showFab ? 1 : 0)).current;
  const fabPop = useRef(new Animated.Value(showFab ? 1 : 0)).current;
  const prevShowFab = useRef(showFab);
  const centeringRef = useRef<Animated.CompositeAnimation | null>(null);
  const routes = state.routes;
  const mid = Math.ceil(routes.length / 2);
  const leftRoutes = routes.slice(0, mid);
  const rightRoutes = routes.slice(mid);

  const iconColor = isDark ? 'rgba(248,250,252,0.92)' : '#111827';
  const activeColor = colors.primary;
  const bottomPad = Math.max(insets.bottom, BOTTOM_PADDING);

  useEffect(() => {
    if (prevShowFab.current === showFab) return;
    prevShowFab.current = showFab;
    centeringRef.current?.stop();
    if (showFab) {
      fabPop.setValue(0);
      centeringRef.current = Animated.parallel([
        Animated.timing(fabSlot, {
          toValue: 1,
          duration: 380,
          easing: FAB_SHOW_EASE,
          useNativeDriver: false,
        }),
        Animated.sequence([
          Animated.delay(70),
          Animated.spring(fabPop, {
            toValue: 1,
            friction: 7.2,
            tension: 150,
            useNativeDriver: true,
          }),
        ]),
      ]);
    } else {
      centeringRef.current = Animated.parallel([
        Animated.timing(fabPop, {
          toValue: 0,
          duration: 160,
          easing: Easing.bezier(0.55, 0.05, 0.8, 0.2),
          useNativeDriver: true,
        }),
        Animated.timing(fabSlot, {
          toValue: 0,
          duration: 320,
          delay: 40,
          easing: FAB_HIDE_EASE,
          useNativeDriver: false,
        }),
      ]);
    }
    centeringRef.current.start();
  }, [showFab, fabPop, fabSlot]);

  const handleFabPress = () => {
    if (activeRoute === 'Combustivel' || activeRoute === 'Reservas' || activeRoute === 'DpRequests') {
      emitFabBarPress(activeRoute as FabBarTabName);
    }
  };

  const fabWidth = fabSlot.interpolate({
    inputRange: [0, 1],
    outputRange: [0, BUTTON],
  });
  const fabGap = fabSlot.interpolate({
    inputRange: [0, 1],
    outputRange: [0, GAP],
  });
  const fabScale = fabPop.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 1],
  });
  const fabRotate = fabPop.interpolate({
    inputRange: [0, 1],
    outputRange: ['-50deg', '0deg'],
  });

  const renderTab = (route: (typeof routes)[number], index: number) => {
    const { options } = descriptors[route.key];
    const focused = state.index === index;
    const label =
      SHORT_LABELS[route.name] ??
      (typeof options.title === 'string' ? options.title : route.name);
    const Icon = ICONS[route.name] ?? House;

    return (
      <SquircleButton
        key={route.key}
        focused={focused}
        isDark={isDark}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        }}
        onLongPress={() => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        }}
      >
        <TabIconView
          Icon={Icon}
          focused={focused}
          color={focused ? activeColor : iconColor}
        />
      </SquircleButton>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.safeFill,
        {
          paddingBottom: bottomPad,
          paddingHorizontal: HORIZONTAL_PADDING,
        },
      ]}
    >
      <View style={styles.row}>
        <View style={styles.cluster}>
          {leftRoutes.map((route) => renderTab(route, routes.indexOf(route)))}
        </View>

        <Animated.View
          pointerEvents={showFab ? 'auto' : 'none'}
          style={{
            width: fabWidth,
            marginLeft: fabGap,
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'visible',
          }}
        >
          <Animated.View
            style={{
              opacity: fabPop,
              transform: [{ scale: Animated.multiply(fabScale, fabPressScale) }, { rotate: fabRotate }],
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Nova"
              onPress={handleFabPress}
              onPressIn={() => {
                Animated.timing(fabPressScale, {
                  toValue: 0.9,
                  duration: 70,
                  useNativeDriver: true,
                }).start();
              }}
              onPressOut={() => {
                Animated.spring(fabPressScale, {
                  toValue: 1,
                  friction: 5,
                  tension: 180,
                  useNativeDriver: true,
                }).start();
              }}
              style={[styles.fab, { backgroundColor: colors.primary }]}
            >
              <Plus size={24} color="#FFFFFF" strokeWidth={2.6} />
            </Pressable>
          </Animated.View>
        </Animated.View>

        <View style={[styles.cluster, { marginLeft: GAP }]}>
          {rightRoutes.map((route) => renderTab(route, routes.indexOf(route)))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: BUTTON,
  },
  cluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GAP,
  },
  shadowWrap: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: RADIUS,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 18,
    elevation: 10,
  },
  squircle: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: RADIUS,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: BUTTON,
    height: BUTTON,
    borderRadius: RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ce3736',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 12,
  },
});
