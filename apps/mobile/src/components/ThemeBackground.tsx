import React from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const BG_LIGHT = require('../../assets/backgrounds/padrao-engenharia-claro.png');
const BG_DARK = require('../../assets/backgrounds/padrao-engenharia-escuro.png');

type Props = {
  children: React.ReactNode;
};

export default function ThemeBackground({ children }: Props) {
  const { isDark, colors } = useTheme();
  const source = isDark ? BG_DARK : BG_LIGHT;
  const patternOpacity = isDark ? 0.55 : 1;

  return (
    <View style={[styles.root, { backgroundColor: colors.appShell }]}>
      <ImageBackground
        source={source}
        style={styles.pattern}
        imageStyle={{ opacity: patternOpacity }}
        resizeMode="repeat"
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
