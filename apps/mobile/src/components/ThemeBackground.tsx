import React, { useEffect } from 'react';
import { Image, ImageBackground, StyleSheet, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const BG_LIGHT = require('../../assets/backgrounds/padrao-engenharia-claro.png');
const BG_DARK = require('../../assets/backgrounds/padrao-engenharia-escuro.png');

/** Mantém os dois padrões em memória para a troca de tema não decodificar PNG do zero. */
let themeBackgroundsPrefetched = false;

function prefetchThemeBackgrounds() {
  if (themeBackgroundsPrefetched) return;
  themeBackgroundsPrefetched = true;
  const light = Image.resolveAssetSource(BG_LIGHT)?.uri;
  const dark = Image.resolveAssetSource(BG_DARK)?.uri;
  if (light) void Image.prefetch(light);
  if (dark) void Image.prefetch(dark);
}

type Props = {
  children: React.ReactNode;
};

export default function ThemeBackground({ children }: Props) {
  const { isDark, colors } = useTheme();

  useEffect(() => {
    prefetchThemeBackgrounds();
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.appShell }]}>
      <ImageBackground
        source={BG_LIGHT}
        style={styles.pattern}
        imageStyle={{ opacity: isDark ? 0 : 1 }}
        resizeMode="repeat"
        pointerEvents="none"
      />
      <ImageBackground
        source={BG_DARK}
        style={styles.pattern}
        imageStyle={{ opacity: isDark ? 0.55 : 0 }}
        resizeMode="repeat"
        pointerEvents="none"
      />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  pattern: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  content: {
    flex: 1,
  },
});
