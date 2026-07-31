import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { Droplets, Car, ChevronRight, Sparkles } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { LiveActivity } from '../hooks/useLiveActivities';

type Props = {
  items: LiveActivity[];
  onPress: (item: LiveActivity) => void;
};

function PulsingDot({ color }: { color: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.55)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.55,
            duration: 900,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 900,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.55,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, scale]);

  return (
    <View style={styles.dotWrap}>
      <Animated.View
        style={[
          styles.dotPulse,
          { backgroundColor: color, opacity, transform: [{ scale }] },
        ]}
      />
      <View style={[styles.dotCore, { backgroundColor: color }]} />
    </View>
  );
}

function ProgressTrack({ accent }: { accent: string }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['8%', '92%'],
  });

  return (
    <View style={styles.track}>
      <View style={[styles.trackBg, { backgroundColor: `${accent}22` }]} />
      <Animated.View style={[styles.trackFill, { backgroundColor: accent, width }]} />
      <View style={styles.trackSteps}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.trackStep, { backgroundColor: accent }]} />
        ))}
      </View>
    </View>
  );
}

function LiveActivityCard({
  item,
  index,
  onPress,
}: {
  item: LiveActivity;
  index: number;
  onPress: () => void;
}) {
  const { colors, isDark } = useTheme();
  const enter = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;

  const isFuel = item.kind === 'fuel';
  const accent = isFuel ? '#059669' : '#2563eb';
  const Icon = isFuel ? Droplets : Car;

  useEffect(() => {
    enter.setValue(0);
    Animated.spring(enter, {
      toValue: 1,
      delay: index * 90,
      friction: 7,
      tension: 70,
      useNativeDriver: true,
    }).start();

    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounce, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(bounce, {
          toValue: 0,
          duration: 700,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    bounceLoop.start();
    return () => bounceLoop.stop();
  }, [bounce, enter, index, item.id]);

  const translateY = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [28, 0],
  });
  const scale = enter.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });
  const iconTranslateY = bounce.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -3],
  });

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [{ translateY }, { scale }],
      }}
    >
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={onPress}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? colors.card : '#fff',
            borderColor: `${accent}33`,
          },
        ]}
      >
        <View style={styles.cardTop}>
          <Animated.View
            style={[
              styles.iconBubble,
              { backgroundColor: `${accent}18`, transform: [{ translateY: iconTranslateY }] },
            ]}
          >
            <Icon size={22} color={accent} strokeWidth={2.2} />
          </Animated.View>

          <View style={styles.cardText}>
            <View style={styles.statusRow}>
              <PulsingDot color={accent} />
              <Text style={[styles.statusLabel, { color: accent }]}>Em andamento</Text>
            </View>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {item.subtitle}
            </Text>
          </View>
        </View>

        <ProgressTrack accent={accent} />

        <View style={styles.cardBottom}>
          <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
            {item.meta}
          </Text>
          <View style={[styles.ctaPill, { backgroundColor: accent }]}>
            <Text style={styles.ctaText}>{item.cta}</Text>
            <ChevronRight size={14} color="#fff" strokeWidth={2.4} />
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function LiveActivitySection({ items, onPress }: Props) {
  const { colors } = useTheme();

  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Sparkles size={16} color={colors.primary} strokeWidth={2.2} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Acompanhe agora</Text>
      </View>
      <View style={styles.list}>
        {items.map((item, index) => (
          <LiveActivityCard
            key={item.id}
            item={item}
            index={index}
            onPress={() => onPress(item)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  list: {
    gap: 12,
  },
  card: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    gap: 14,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    minWidth: 0,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 2,
  },
  track: {
    height: 10,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  trackFill: {
    height: 10,
    borderRadius: 999,
  },
  trackSteps: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  trackStep: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.35,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  meta: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
  },
  ctaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  ctaText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  dotWrap: {
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotCore: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotPulse: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});
