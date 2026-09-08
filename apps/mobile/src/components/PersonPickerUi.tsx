import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronDown } from 'lucide-react-native';
import UserAvatar from './UserAvatar';

export type PersonPickerOption = {
  value: string;
  label: string;
  subtitle?: string;
  avatarUri?: string | null;
};

type ThemeColors = {
  text: string;
  textSecondary: string;
  primary: string;
  card?: string;
  surface?: string;
};

export function PersonPickerListRow({
  label,
  subtitle,
  avatarUri,
  colors,
  isDark,
  onPress,
}: {
  label: string;
  subtitle?: string;
  avatarUri?: string | null;
  colors: ThemeColors;
  isDark: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.pickerItem,
        { backgroundColor: isDark ? colors.card : colors.surface },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <UserAvatar
        uri={avatarUri}
        size={40}
        backgroundColor={colors.primary}
        iconColor="#fff"
      />
      <View style={styles.pickerTextWrap}>
        <Text
          style={[styles.pickerLabel, { color: colors.text }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.pickerSubtitle, { color: colors.textSecondary }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export function PersonSelectField({
  label,
  valueLabel,
  valueSubtitle,
  valueAvatarUri,
  placeholder,
  onPress,
  colors,
  isDark,
}: {
  label: string;
  valueLabel: string;
  valueSubtitle?: string;
  valueAvatarUri?: string | null;
  placeholder: string;
  onPress: () => void;
  colors: ThemeColors;
  isDark: boolean;
}) {
  const filled = !!valueLabel;

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        style={[
          styles.fieldBtn,
          {
            backgroundColor: isDark ? colors.card : colors.surface,
            borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
          },
        ]}
      >
        {filled ? (
          <UserAvatar
            uri={valueAvatarUri}
            size={36}
            backgroundColor={colors.primary}
            iconColor="#fff"
          />
        ) : null}
        <View style={styles.fieldTextWrap}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: filled ? '600' : '500',
              color: filled ? colors.text : colors.textSecondary,
              letterSpacing: -0.2,
            }}
            numberOfLines={1}
          >
            {valueLabel || placeholder}
          </Text>
          {filled && valueSubtitle ? (
            <Text
              style={{
                marginTop: 3,
                fontSize: 12,
                fontWeight: '500',
                color: colors.textSecondary,
              }}
              numberOfLines={1}
            >
              {valueSubtitle}
            </Text>
          ) : null}
        </View>
        <View
          style={[
            styles.chevronWrap,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
            },
          ]}
        >
          <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.2} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  pickerLabel: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  pickerSubtitle: {
    fontSize: 12,
    marginTop: 3,
    fontWeight: '500',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    letterSpacing: -0.1,
  },
  fieldBtn: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth * 1.5,
  },
  fieldTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  chevronWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
