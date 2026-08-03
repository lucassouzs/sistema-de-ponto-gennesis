import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
} from 'react-native';
import { Droplets, Car, ArrowUpRight } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { LiveActivity } from '../hooks/useLiveActivities';

type Props = {
  items: LiveActivity[];
  onPress: (item: LiveActivity) => void;
};

function RadarRings({ color }: { color: string }) {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  const c = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const make = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: 2200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(v, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      );
    const la = make(a, 0);
    const lb = make(b, 700);
    const lc = make(c, 1400);
    la.start();
    lb.start();
    lc.start();
    return () => {
      la.stop();
      lb.stop();
      lc.stop();
    };
  }, [a, b, c]);

  const ring = (v: Animated.Value) => ({
    opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.45, 0] }),
    transform: [
      { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.85] }) },
    ],
  });

  return (
    <View style={styles.radarWrap} pointerEvents="none">
      <Animated.View style={[styles.radarRing, { borderColor: color }, ring(a)]} />
      <Animated.View style={[styles.radarRing, { borderColor: color }, ring(b)]} />
      <Animated.View style={[styles.radarRing, { borderColor: color }, ring(c)]} />
    </View>
  );
}

function SweepLight({ color }: { color: string }) {
  const x = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(1200),
        Animated.timing(x, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.sweep,
        {
          backgroundColor: color,
          transform: [
            {
              translateX: x.interpolate({
                inputRange: [0, 1],
                outputRange: [-80, 360],
              }),
            },
            { skewX: '-20deg' },
          ],
        },
      ]}
    />
  );
}

function MovingTrack({ color }: { color: string }) {
  const progress = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const move = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }),
        Animated.delay(250),
        Animated.timing(progress, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ]),
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    move.start();
    pulse.start();
    return () => {
      move.stop();
      pulse.stop();
    };
  }, [glow, progress]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['8%', '50%'],
  });

  return (
    <View style={styles.track}>
      <View style={[styles.trackBg, { backgroundColor: `${color}28` }]} />
      <Animated.View style={[styles.trackFill, { backgroundColor: color, width }]}>
        <Animated.View
          style={[
            styles.trackHead,
            {
              backgroundColor: '#fff',
              shadowColor: color,
              opacity: glow.interpolate({
                inputRange: [0, 1],
                outputRange: [0.55, 1],
              }),
              transform: [
                {
                  scale: glow.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.85, 1.15],
                  }),
                },
              ],
            },
          ]}
        />
      </Animated.View>
      {[0.22, 0.48, 0.74].map((left) => (
        <View
          key={left}
          style={[styles.trackDot, { left: `${left * 100}%`, backgroundColor: color }]}
        />
      ))}
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
  const enter = useRef(new Animated.Value(0)).current;
  const floatY = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  const ctaPulse = useRef(new Animated.Value(0)).current;

  const isFuel = item.kind === 'fuel';
  const accent = isFuel ? '#34d399' : '#60a5fa';
  const deep = isFuel ? '#064e3b' : '#1e3a8a';
  const mid = isFuel ? '#047857' : '#1d4ed8';
  const Icon = isFuel ? Droplets : Car;

  useEffect(() => {
    enter.setValue(0);
    Animated.spring(enter, {
      toValue: 1,
      delay: index * 100,
      friction: 6.2,
      tension: 58,
      useNativeDriver: true,
    }).start();

    const floatLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatY, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const spinLoop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: isFuel ? 5200 : 7000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );

    const ctaLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaPulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ctaPulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    floatLoop.start();
    spinLoop.start();
    ctaLoop.start();
    return () => {
      floatLoop.stop();
      spinLoop.stop();
      ctaLoop.stop();
    };
  }, [ctaPulse, enter, floatY, index, isFuel, item.id, spin]);

  return (
    <Animated.View
      style={{
        opacity: enter,
        transform: [
          {
            translateY: enter.interpolate({
              inputRange: [0, 1],
              outputRange: [40, 0],
            }),
          },
          {
            scale: Animated.multiply(
              enter.interpolate({
                inputRange: [0, 1],
                outputRange: [0.9, 1],
              }),
              press,
            ),
          },
        ],
      }}
    >
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          Animated.spring(press, {
            toValue: 0.97,
            friction: 6,
            useNativeDriver: true,
          }).start();
        }}
        onPressOut={() => {
          Animated.spring(press, {
            toValue: 1,
            friction: 5,
            tension: 140,
            useNativeDriver: true,
          }).start();
        }}
        style={[
          styles.card,
          {
            backgroundColor: deep,
            shadowColor: accent,
            borderColor: `${accent}40`,
          },
        ]}
      >
        <View style={[styles.glowBlob, { backgroundColor: `${accent}30` }]} />
        <View style={[styles.glowBlobB, { backgroundColor: `${mid}55` }]} />
        <SweepLight color={`${accent}55`} />

        <View style={styles.topRow}>
          <View style={styles.liveBadge}>
            <View style={[styles.liveDot, { backgroundColor: accent }]} />
            <Text style={[styles.liveText, { color: accent }]}>AO VIVO</Text>
          </View>

          <View style={styles.iconStage}>
            <RadarRings color={accent} />
            <Animated.View
              style={[
                styles.orbit,
                {
                  borderColor: `${accent}35`,
                  transform: [
                    {
                      rotate: spin.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', '360deg'],
                      }),
                    },
                  ],
                },
              ]}
            >
              <View style={[styles.orbitDot, { backgroundColor: accent }]} />
            </Animated.View>
            <Animated.View
              style={[
                styles.iconBubble,
                {
                  backgroundColor: `${accent}22`,
                  borderColor: `${accent}55`,
                  transform: [
                    {
                      translateY: floatY.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -5],
                      }),
                    },
                    {
                      rotate: floatY.interpolate({
                        inputRange: [0, 1],
                        outputRange: isFuel ? ['-3deg', '3deg'] : ['-8deg', '8deg'],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Icon size={26} color={accent} strokeWidth={2.2} />
            </Animated.View>
          </View>
        </View>

        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {item.subtitle}
        </Text>
        {item.meta ? (
          <Text style={[styles.meta, { color: `${accent}cc` }]} numberOfLines={1}>
            {item.meta}
          </Text>
        ) : null}

        <MovingTrack color={accent} />

        <View style={styles.ctaRow}>
          <Text style={[styles.ctaLabel, { color: accent }]}>{item.cta}</Text>
          <Animated.View
            style={[
              styles.ctaBtn,
              {
                backgroundColor: accent,
                transform: [
                  {
                    translateX: ctaPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 4],
                    }),
                  },
                  {
                    scale: ctaPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.06],
                    }),
                  },
                ],
              },
            ]}
          >
            <ArrowUpRight size={16} color={isFuel ? '#064e3b' : '#1e3a8a'} strokeWidth={2.6} />
          </Animated.View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function LiveActivitySection({ items, onPress }: Props) {
  const { colors } = useTheme();
  const headerPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(headerPulse, {
          toValue: 1,
          duration: 1100,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(headerPulse, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
        Animated.delay(700),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [headerPulse]);

  if (items.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <View style={styles.headerDotWrap}>
          <Animated.View
            style={[
              styles.headerRing,
              {
                backgroundColor: colors.primary,
                opacity: headerPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.45, 0],
                }),
                transform: [
                  {
                    scale: headerPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 2.4],
                    }),
                  },
                ],
              },
            ]}
          />
          <View style={[styles.headerDot, { backgroundColor: colors.primary }]} />
        </View>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Acompanhe agora</Text>
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
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  headerDotWrap: {
    width: 12,
    height: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  headerRing: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.25,
  },
  list: {
    gap: 14,
  },
  card: {
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 22,
    elevation: 8,
  },
  glowBlob: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    top: -50,
    right: -40,
  },
  glowBlobB: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -40,
    left: -30,
  },
  sweep: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 56,
    opacity: 0.2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  liveText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  iconStage: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarRing: {
    position: 'absolute',
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1.5,
  },
  orbit: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
  },
  orbitDot: {
    position: 'absolute',
    top: -3,
    left: '50%',
    marginLeft: -3,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  iconBubble: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  meta: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  track: {
    marginTop: 16,
    height: 8,
    justifyContent: 'center',
    position: 'relative',
  },
  trackBg: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  trackFill: {
    height: 8,
    borderRadius: 999,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  trackHead: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: -2,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 8,
    elevation: 3,
  },
  trackDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    marginLeft: -2.5,
    opacity: 0.35,
  },
  ctaRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ctaLabel: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  ctaBtn: {
    width: 36,
    height: 36,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
