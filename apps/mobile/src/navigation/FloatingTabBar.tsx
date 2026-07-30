import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Animated,
  Easing,
  LayoutChangeEvent,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Plus } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { emitFabBarPress, FabBarTabName } from './fabBarEvents';

/** Dimensões alinhadas ao FabBar (Constants.swift) */
const BAR_HEIGHT = 62;
const CONTENT_PADDING = 2;
const FAB_SPACING = 8;
const HORIZONTAL_PADDING = 21;
const BOTTOM_PADDING = 21;

type TabIcon =
  | { set: 'ion'; name: React.ComponentProps<typeof Ionicons>['name'] }
  | { set: 'mci'; name: React.ComponentProps<typeof MaterialCommunityIcons>['name'] };

const ICONS: Record<string, TabIcon> = {
  Combustivel: { set: 'mci', name: 'gas-station' },
  Reservas: { set: 'ion', name: 'calendar' },
  Perfil: { set: 'ion', name: 'person' },
  Fuel: { set: 'mci', name: 'gas-station' },
  Vehicle: { set: 'ion', name: 'calendar' },
  Profile: { set: 'ion', name: 'person' },
};

const SHORT_LABELS: Record<string, string> = {
  Combustivel: 'Combustível',
  Reservas: 'Reservas',
  Perfil: 'Perfil',
  Fuel: 'Combustível',
  Vehicle: 'Reservas',
  Profile: 'Perfil',
};

const FAB_TABS = new Set(['Combustivel', 'Reservas', 'Fuel', 'Vehicle']);

type TabLayout = { x: number; width: number };

const SLIDE_EASE = Easing.bezier(0.32, 0.72, 0, 1);

function TabItem({
  focused,
  label,
  icon,
  activeColor,
  inactiveColor,
  onPress,
  onLongPress,
  accessibilityLabel,
  onLayout,
}: {
  focused: boolean;
  label: string;
  icon: TabIcon;
  activeColor: string;
  inactiveColor: string;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel?: string;
  onLayout: (e: LayoutChangeEvent) => void;
}) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const tint = focused ? activeColor : inactiveColor;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
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
          tension: 160,
          useNativeDriver: true,
        }).start();
      }}
      onLongPress={onLongPress}
      onLayout={onLayout}
      style={styles.item}
    >
      <Animated.View style={[styles.tabInner, { transform: [{ scale: pressScale }] }]}>
        {icon.set === 'mci' ? (
          <MaterialCommunityIcons name={icon.name} size={22} color={tint} />
        ) : (
          <Ionicons name={icon.name} size={22} color={tint} />
        )}
        <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [layouts, setLayouts] = useState<Record<number, TabLayout>>({});

  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorW = useRef(new Animated.Value(80)).current;
  const barY = useRef(new Animated.Value(0)).current;
  const fabScale = useRef(new Animated.Value(1)).current;
  const ready = useRef(false);
  const prevIndex = useRef(state.index);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  const activeRoute = state.routes[state.index]?.name ?? '';
  const showFab = FAB_TABS.has(activeRoute);

  const barFill = isDark ? '#1C1C1E' : '#FFFFFF';
  const selectFill = isDark ? '#3A3A3C' : '#E5E5EA';
  const activeColor = colors.primary;
  const inactiveColor = isDark ? 'rgba(255,255,255,0.72)' : 'rgba(60,60,67,0.55)';

  useEffect(() => {
    const to = layouts[state.index];
    if (!to) return;

    if (!ready.current) {
      indicatorX.setValue(to.x);
      indicatorW.setValue(to.width);
      ready.current = true;
      prevIndex.current = state.index;
      return;
    }

    if (prevIndex.current === state.index) return;
    prevIndex.current = state.index;
    animRef.current?.stop();

    animRef.current = Animated.parallel([
      Animated.timing(indicatorX, {
        toValue: to.x,
        duration: 320,
        easing: SLIDE_EASE,
        useNativeDriver: false,
      }),
      Animated.timing(indicatorW, {
        toValue: to.width,
        duration: 320,
        easing: SLIDE_EASE,
        useNativeDriver: false,
      }),
    ]);
    animRef.current.start();

    Animated.sequence([
      Animated.timing(barY, { toValue: 1.5, duration: 70, useNativeDriver: true }),
      Animated.spring(barY, { toValue: 0, friction: 7, tension: 140, useNativeDriver: true }),
    ]).start();
  }, [state.index, layouts, indicatorX, indicatorW, barY]);

  // Recalcula select quando o FAB some/aparece (largura da pill muda)
  useEffect(() => {
    ready.current = false;
  }, [showFab]);

  const setTabLayout = (index: number, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const curr = prev[index];
      if (curr && Math.abs(curr.x - x) < 0.5 && Math.abs(curr.width - width) < 0.5) return prev;
      return { ...prev, [index]: { x, width } };
    });
  };

  const handleFabPress = () => {
    const name = activeRoute as FabBarTabName;
    if (name === 'Combustivel' || name === 'Reservas' || name === 'Fuel' || name === 'Vehicle') {
      emitFabBarPress(name === 'Fuel' ? 'Combustivel' : name === 'Vehicle' ? 'Reservas' : name);
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.safeFill,
        {
          paddingBottom: Math.max(insets.bottom, BOTTOM_PADDING),
          paddingHorizontal: HORIZONTAL_PADDING,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.row,
          isDark ? styles.shadowDark : styles.shadowLight,
          { transform: [{ translateY: barY }] },
        ]}
      >
        <View style={[styles.pill, { backgroundColor: barFill }]}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.select,
              {
                left: indicatorX,
                width: indicatorW,
                backgroundColor: selectFill,
              },
            ]}
          />

          {state.routes.map((route, index) => {
            const { options } = descriptors[route.key];
            const focused = state.index === index;
            const label =
              SHORT_LABELS[route.name] ??
              (typeof options.title === 'string' ? options.title : route.name);
            const icon = ICONS[route.name] ?? { set: 'mci' as const, name: 'gas-station' as const };

            return (
              <TabItem
                key={route.key}
                focused={focused}
                label={label}
                icon={icon}
                activeColor={activeColor}
                inactiveColor={inactiveColor}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                onLayout={(e) => setTabLayout(index, e)}
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
              />
            );
          })}
        </View>

        {showFab ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nova"
            onPress={handleFabPress}
            onPressIn={() => {
              Animated.timing(fabScale, {
                toValue: 0.9,
                duration: 80,
                useNativeDriver: true,
              }).start();
            }}
            onPressOut={() => {
              Animated.spring(fabScale, {
                toValue: 1,
                friction: 6,
                tension: 160,
                useNativeDriver: true,
              }).start();
            }}
          >
            <Animated.View
              style={[
                styles.fab,
                { backgroundColor: colors.primary, transform: [{ scale: fabScale }] },
              ]}
            >
              <Plus size={22} color="#FFFFFF" strokeWidth={2.5} />
            </Animated.View>
          </Pressable>
        ) : null}
      </Animated.View>
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
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FAB_SPACING,
    height: BAR_HEIGHT,
  },
  shadowLight: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
      },
      android: { elevation: 10 },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
      },
    }),
  },
  shadowDark: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.45,
        shadowRadius: 20,
      },
      android: { elevation: 14 },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.45,
        shadowRadius: 20,
      },
    }),
  },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    height: BAR_HEIGHT,
    borderRadius: 999,
    paddingHorizontal: CONTENT_PADDING,
    paddingVertical: CONTENT_PADDING,
    position: 'relative',
    overflow: 'hidden',
  },
  select: {
    position: 'absolute',
    top: CONTENT_PADDING,
    bottom: CONTENT_PADDING,
    borderRadius: 999,
    zIndex: 0,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  fab: {
    width: BAR_HEIGHT,
    height: BAR_HEIGHT,
    borderRadius: BAR_HEIGHT / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
