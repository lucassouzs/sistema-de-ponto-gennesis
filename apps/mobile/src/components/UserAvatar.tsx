import React, { useState } from 'react';
import { View, Image, StyleSheet, ViewStyle } from 'react-native';
import { User } from 'lucide-react-native';
import { resolveMediaUrl } from '../utils/resolveMediaUrl';

type Props = {
  uri?: string | null;
  size?: number;
  iconColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  style?: ViewStyle;
};

export default function UserAvatar({
  uri,
  size = 48,
  iconColor = '#fff',
  backgroundColor = 'rgba(255,255,255,0.18)',
  borderColor,
  borderWidth = 0,
  style,
}: Props) {
  const resolved = resolveMediaUrl(uri);
  const [failed, setFailed] = useState(false);
  const showPhoto = !!resolved && !failed;
  const iconSize = Math.round(size * 0.42);

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: showPhoto ? '#ddd' : backgroundColor,
          borderColor,
          borderWidth: borderColor ? borderWidth : 0,
        },
        style,
      ]}
    >
      {showPhoto ? (
        <Image
          source={{ uri: resolved }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setFailed(true)}
        />
      ) : (
        <User size={iconSize} color={iconColor} strokeWidth={2} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
