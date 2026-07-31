import React, { useEffect, useRef } from 'react';
import { View, Image, StyleSheet, Animated, Easing } from 'react-native';
import { StatusBar } from 'expo-status-bar';

export const SPLASH_LOGO_SIZE = 96;
export const SPLASH_BG = '#ce3736';

/** Splash vermelho com logo branca no centro — mesmo ponto inicial do Login. */
export default function AuthBrandSplash({
  logoSize = SPLASH_LOGO_SIZE,
}: {
  logoSize?: number;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.04,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [fade, pulse]);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Animated.View style={{ opacity: fade, transform: [{ scale: pulse }] }}>
        <Image
          source={require('../../assets/logobranca.png')}
          style={{ width: logoSize, height: logoSize }}
          resizeMode="contain"
          accessibilityLabel="Gennesis"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SPLASH_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
