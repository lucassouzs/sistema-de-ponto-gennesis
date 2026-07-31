import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Animated,
  Easing,
} from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Plus } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { emitFabBarPress, FabBarTabName } from './fabBarEvents';

const BAR_HEIGHT = 62;
const CONTENT_PADDING = 4;
const FAB_SPACING = 8;
const HORIZONTAL_PADDING = 21;
const BOTTOM_PADDING = 21;
const PILL_BORDER = StyleSheet.hairlineWidth * 1.5;

type TabIcon =
  | { set: 'ion'; name: React.ComponentProps<typeof Ionicons>['name'] }
  | { set: 'mci'; name: React.ComponentProps<typeof MaterialCommunityIcons>['name'] };

const ICONS: Record<string, TabIcon> = {
  Home: { set: 'ion', name: 'home' },
  Combustivel: { set: 'mci', name: 'gas-station' },
  Reservas: { set: 'ion', name: 'calendar' },
  Fuel: { set: 'mci', name: 'gas-station' },
  Vehicle: { set: 'ion', name: 'calendar' },
};

const SHORT_LABELS: Record<string, string> = {
  Home: 'Início',
  Combustivel: 'Combustível',
  Reservas: 'Reservas',
  Fuel: 'Combustível',
  Vehicle: 'Reservas',
};

const FAB_TABS = new Set(['Combustivel', 'Reservas', 'Fuel', 'Vehicle']);
const SLIDE_EASE = Easing.bezier(0.32, 0.72, 0, 1);
const CENTER_EASE = Easing.bezier(0.33, 1, 0.68, 1);

function TabIconView({
  icon,
  color,
  size = 22,
}: {
  icon: TabIcon;
  color: string;
  size?: number;
}) {
  if (icon.set === 'mci') {
    return <MaterialCommunityIcons name={icon.name} size={size} color={color} />;
  }
  return <Ionicons name={icon.name} size={size} color={color} />;
}

function TabItem({
  focused,
  label,
  icon,
  activeColor,
  inactiveColor,
  selectFill,
  onPress,
  onLongPress,
  accessibilityLabel,
  width,
}: {
  focused: boolean;
  label: string;
  icon: TabIcon;
  activeColor: string;
  inactiveColor: string;
  selectFill: string;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel?: string;
  width: number | Animated.AnimatedInterpolation<number>;
}) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const selectAnim = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const tint = focused ? activeColor : inactiveColor;

  useEffect(() => {
    Animated.timing(selectAnim, {
      toValue: focused ? 1 : 0,
      duration: focused ? 280 : 160,
      easing: SLIDE_EASE,
      useNativeDriver: false,
    }).start();
  }, [focused, selectAnim]);

  return (
    <Animated.View style={[styles.item, { width }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={accessibilityLabel ?? label}
        onPress={onPress}
        onPressIn={() => {
          Animated.timing(pressScale, {
            toValue: 0.92,
            duration: 80,
            useNativeDriver: false,
          }).start();
        }}
        onPressOut={() => {
          Animated.spring(pressScale, {
            toValue: 1,
            friction: 6,
            tension: 160,
            useNativeDriver: false,
          }).start();
        }}
        onLongPress={onLongPress}
        style={styles.itemPress}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.select,
            {
              backgroundColor: selectFill,
              opacity: selectAnim,
              transform: [
                {
                  scale: selectAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1],
                  }),
                },
              ],
            },
          ]}
        />
        <Animated.View style={[styles.tabInner, { transform: [{ scale: pressScale }] }]}>
          <TabIconView icon={icon} color={tint} />
          <Text style={[styles.label, { color: tint }]} numberOfLines={1}>
            {label}
          </Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

function GlassFill({
  useBlur,
  blurIntensity,
  isDark,
  barFill,
}: {
  useBlur: boolean;
  blurIntensity: number;
  isDark: boolean;
  barFill: string;
}) {
  if (!useBlur) {
    return (
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: barFill }]}
      />
    );
  }
  return (
    <>
      <BlurView
        intensity={blurIntensity}
        tint={isDark ? 'dark' : 'light'}
        experimentalBlurMethod="dimezisBlurView"
        style={StyleSheet.absoluteFillObject}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, { backgroundColor: barFill }]}
      />
    </>
  );
}

export default function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const [rowWidth, setRowWidth] = useState(0);

  const tabSwitchScale = useRef(new Animated.Value(1)).current;
  const fabPressScale = useRef(new Animated.Value(1)).current;
  const prevIndex = useRef(state.index);
  const centeringRef = useRef<Animated.CompositeAnimation | null>(null);
  const switchRef = useRef<Animated.CompositeAnimation | null>(null);

  const activeRoute = state.routes[state.index]?.name ?? '';
  const showFab = FAB_TABS.has(activeRoute);
  const centerProgress = useRef(new Animated.Value(showFab ? 0 : 1)).current;
  const tabCount = Math.max(state.routes.length, 1);

  const barFill = isDark ? 'rgba(31, 41, 55, 0.52)' : '#FFFFFF';
  const selectFill = isDark ? 'rgba(55, 65, 81, 0.72)' : 'rgba(206, 55, 54, 0.1)';
  const pillBorder = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(15, 23, 42, 0.08)';
  const activeColor = colors.primary;
  const inactiveColor = isDark ? colors.textSecondary : 'rgba(60,60,67,0.55)';
  const useBlur = Platform.OS !== 'web' && isDark;
  const blurIntensity = Platform.OS === 'ios' ? 55 : 48;

  useEffect(() => {
    if (prevIndex.current === state.index) return;
    prevIndex.current = state.index;

    switchRef.current?.stop();
    tabSwitchScale.setValue(1);
    switchRef.current = Animated.sequence([
      Animated.timing(tabSwitchScale, {
        toValue: 1.025,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
      Animated.timing(tabSwitchScale, {
        toValue: 1,
        duration: 140,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }),
    ]);
    switchRef.current.start();
  }, [state.index, tabSwitchScale]);

  useEffect(() => {
    centeringRef.current?.stop();
    centeringRef.current = Animated.timing(centerProgress, {
      toValue: showFab ? 0 : 1,
      duration: 480,
      easing: CENTER_EASE,
      useNativeDriver: false,
    });
    centeringRef.current.start();
  }, [showFab, centerProgress]);

  const handleFabPress = () => {
    const name = activeRoute as FabBarTabName;
    if (name === 'Combustivel' || name === 'Reservas' || name === 'Fuel' || name === 'Vehicle') {
      emitFabBarPress(name === 'Fuel' ? 'Combustivel' : name === 'Vehicle' ? 'Reservas' : name);
    }
  };

  const widthWithFab = Math.max(rowWidth - BAR_HEIGHT - FAB_SPACING, 1);
  const widthCentered = Math.max(Math.min(rowWidth * 0.78, 320), 1);
  const marginCentered = Math.max((rowWidth - widthCentered) / 2, 0);

  const pillW = centerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [widthWithFab, widthCentered],
  });
  const pillML = centerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, marginCentered],
  });

  const chrome = CONTENT_PADDING * 2 + PILL_BORDER * 2;
  const innerW = Animated.subtract(pillW, chrome);
  const tabW = Animated.divide(innerW, tabCount);

  const fabWidth = centerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [BAR_HEIGHT, 0],
  });
  const fabGap = centerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [FAB_SPACING, 0],
  });
  const fabOpacity = centerProgress.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [1, 0.15, 0],
  });
  const fabScale = centerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.6],
  });

  const bottomPad = Math.max(insets.bottom, BOTTOM_PADDING);

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
      <Animated.View
        pointerEvents="box-none"
        style={[styles.row, { transform: [{ scale: tabSwitchScale }] }]}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (Math.abs(w - rowWidth) > 0.5) setRowWidth(w);
        }}
      >
        <View style={styles.pillSlot}>
          <Animated.View
            style={[
              styles.pillShadowWrap,
              {
                width: rowWidth > 0 ? pillW : undefined,
                marginLeft: rowWidth > 0 ? pillML : 0,
                flex: rowWidth > 0 ? undefined : 1,
              },
            ]}
          >
            <View
              style={[
                styles.pill,
                {
                  borderColor: pillBorder,
                  borderWidth: PILL_BORDER,
                  backgroundColor: useBlur ? 'transparent' : barFill,
                },
              ]}
            >
              <GlassFill
                useBlur={useBlur}
                blurIntensity={blurIntensity}
                isDark={isDark}
                barFill={barFill}
              />

              <Animated.View style={[styles.track, { width: innerW }]}>
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
                      selectFill={selectFill}
                      accessibilityLabel={options.tabBarAccessibilityLabel}
                      width={tabW}
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
              </Animated.View>
            </View>
          </Animated.View>
        </View>

        <Animated.View
          pointerEvents={showFab ? 'auto' : 'none'}
          style={{
            width: fabWidth,
            marginLeft: fabGap,
            opacity: fabOpacity,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: fabScale }],
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Nova"
            onPress={handleFabPress}
            onPressIn={() => {
              Animated.timing(fabPressScale, {
                toValue: 0.9,
                duration: 80,
                useNativeDriver: false,
              }).start();
            }}
            onPressOut={() => {
              Animated.spring(fabPressScale, {
                toValue: 1,
                friction: 6,
                tension: 160,
                useNativeDriver: false,
              }).start();
            }}
          >
            <Animated.View
              style={[
                styles.fab,
                {
                  backgroundColor: colors.primary,
                  transform: [{ scale: fabPressScale }],
                },
              ]}
            >
              <Plus size={22} color="#FFFFFF" strokeWidth={2.5} />
            </Animated.View>
          </Pressable>
        </Animated.View>
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
    height: BAR_HEIGHT,
  },
  pillSlot: {
    flex: 1,
    height: BAR_HEIGHT,
    justifyContent: 'center',
  },
  pillShadowWrap: {
    height: BAR_HEIGHT,
    borderRadius: 999,
  },
  pill: {
    height: BAR_HEIGHT,
    borderRadius: 999,
    padding: CONTENT_PADDING,
    position: 'relative',
    overflow: 'hidden',
  },
  track: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: '100%',
  },
  select: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    zIndex: 0,
  },
  item: {
    height: '100%',
  },
  itemPress: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    zIndex: 2,
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
