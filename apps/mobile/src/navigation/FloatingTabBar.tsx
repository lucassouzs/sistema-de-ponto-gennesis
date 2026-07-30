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

/** Dimensões alinhadas ao FabBar (Constants.swift) */
const BAR_HEIGHT = 62;
const CONTENT_PADDING = 2;
const FAB_SPACING = 8;
const HORIZONTAL_PADDING = 21;
const BOTTOM_PADDING = 21;
const PILL_BORDER = StyleSheet.hairlineWidth * 1.5;

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

const SLIDE_EASE = Easing.bezier(0.32, 0.72, 0, 1);

function TabItem({
  focused,
  label,
  icon,
  activeColor,
  inactiveColor,
  selectFill,
  selectBorder,
  onPress,
  onLongPress,
  accessibilityLabel,
}: {
  focused: boolean;
  label: string;
  icon: TabIcon;
  activeColor: string;
  inactiveColor: string;
  selectFill: string;
  selectBorder: string;
  onPress: () => void;
  onLongPress: () => void;
  accessibilityLabel?: string;
}) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const selectAnim = useRef(new Animated.Value(focused ? 1 : 0)).current;
  const tint = focused ? activeColor : inactiveColor;

  useEffect(() => {
    Animated.timing(selectAnim, {
      toValue: focused ? 1 : 0,
      duration: focused ? 280 : 160,
      easing: SLIDE_EASE,
      useNativeDriver: true,
    }).start();
  }, [focused, selectAnim]);

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
      style={styles.item}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.select,
          {
            backgroundColor: selectFill,
            borderColor: selectBorder,
            borderWidth: StyleSheet.hairlineWidth,
            opacity: selectAnim,
            transform: [
              {
                scale: selectAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.86, 1],
                }),
              },
            ],
          },
        ]}
      />
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
  const [rowWidth, setRowWidth] = useState(0);

  const barY = useRef(new Animated.Value(0)).current;
  const fabPressScale = useRef(new Animated.Value(1)).current;
  const prevIndex = useRef(state.index);
  const centeringRef = useRef<Animated.CompositeAnimation | null>(null);

  const activeRoute = state.routes[state.index]?.name ?? '';
  const showFab = FAB_TABS.has(activeRoute);
  const centerProgress = useRef(new Animated.Value(showFab ? 0 : 1)).current;

  // Liquid glass nos dois (iOS + Android)
  const barFill = isDark ? 'rgba(31, 41, 55, 0.52)' : 'rgba(255, 255, 255, 0.55)';
  const selectFill = isDark ? 'rgba(55, 65, 81, 0.72)' : 'rgba(229, 229, 234, 0.78)';
  const pillBorder = isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.65)';
  const selectBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)';
  const activeColor = colors.primary;
  const inactiveColor = isDark ? colors.textSecondary : 'rgba(60,60,67,0.55)';
  const useBlur = Platform.OS !== 'web';
  const blurIntensity = Platform.OS === 'ios' ? 55 : 48;

  useEffect(() => {
    if (prevIndex.current === state.index) return;
    prevIndex.current = state.index;

    Animated.sequence([
      Animated.timing(barY, { toValue: 1.5, duration: 70, useNativeDriver: true }),
      Animated.spring(barY, { toValue: 0, friction: 7, tension: 140, useNativeDriver: true }),
    ]).start();
  }, [state.index, barY]);

  useEffect(() => {
    centeringRef.current?.stop();
    centeringRef.current = Animated.spring(centerProgress, {
      toValue: showFab ? 0 : 1,
      friction: 8,
      tension: 90,
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

  const fabSlot = BAR_HEIGHT + FAB_SPACING;
  const pillWidthWithFab = Math.max(rowWidth - fabSlot, 1);
  const pillWidthCentered = Math.max(Math.min(rowWidth * 0.78, 320), 1);
  const pillMarginCentered = Math.max((rowWidth - pillWidthCentered) / 2, 0);

  const pillWidth = centerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [pillWidthWithFab, pillWidthCentered],
  });
  const pillMarginLeft = centerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, pillMarginCentered],
  });
  const fabOpacity = centerProgress.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [1, 0, 0],
  });
  const fabHideScale = centerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.55],
  });
  const fabWidth = centerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [BAR_HEIGHT, 0],
  });
  const fabGap = centerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [FAB_SPACING, 0],
  });

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
        style={[styles.row, { transform: [{ translateY: barY }] }]}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          if (Math.abs(w - rowWidth) > 0.5) setRowWidth(w);
        }}
      >
        <Animated.View
          style={[
            styles.pill,
            {
              width: rowWidth > 0 ? pillWidth : undefined,
              marginLeft: rowWidth > 0 ? pillMarginLeft : 0,
              flex: rowWidth > 0 ? undefined : 1,
              borderColor: pillBorder,
              borderWidth: PILL_BORDER,
              backgroundColor: useBlur ? 'transparent' : barFill,
            },
          ]}
        >
          {useBlur ? (
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
          ) : (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFillObject, { backgroundColor: barFill }]}
            />
          )}

          <View style={styles.track}>
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
                  selectBorder={selectBorder}
                  accessibilityLabel={options.tabBarAccessibilityLabel}
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
        </Animated.View>

        <Animated.View
          pointerEvents={showFab ? 'auto' : 'none'}
          style={{
            width: fabWidth,
            marginLeft: fabGap,
            opacity: fabOpacity,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ scale: fabHideScale }],
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
  pill: {
    flexDirection: 'column',
    height: BAR_HEIGHT,
    borderRadius: 999,
    padding: CONTENT_PADDING,
    position: 'relative',
    overflow: 'hidden',
  },
  track: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  select: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    zIndex: 0,
  },
  item: {
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
