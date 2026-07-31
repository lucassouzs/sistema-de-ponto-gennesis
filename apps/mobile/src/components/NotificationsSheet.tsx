import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Bell, Droplets, CalendarCheck, X } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../notifications/NotificationsContext';
import {
  ActivityNotification,
  formatRelativeTime,
} from '../notifications/activityStorage';

export default function NotificationsSheet() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { notifications, sheetVisible, closeSheet } = useNotifications();
  const styles = getStyles(colors, isDark);

  const openItem = (item: ActivityNotification) => {
    closeSheet();
    setTimeout(() => {
      const screen = item.kind === 'fuel' ? 'Combustivel' : 'Reservas';
      navigation.navigate('Main', { screen });
    }, 220);
  };

  return (
    <Modal
      visible={sheetVisible}
      animationType="slide"
      transparent
      onRequestClose={closeSheet}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.background,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={styles.handleWrap}>
            <View style={[styles.handle, { backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.18)' }]} />
          </View>

          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.text }]}>Notificações</Text>
            </View>
            <TouchableOpacity
              onPress={closeSheet}
              style={styles.closeBtn}
              hitSlop={8}
            >
              <X size={18} color={colors.text} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            contentContainerStyle={
              notifications.length === 0 ? styles.emptyWrap : styles.listContent
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={[styles.emptyIcon, { backgroundColor: isDark ? colors.card : '#EEF0F3' }]}>
                  <Bell size={22} color={colors.textSecondary} strokeWidth={2} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Tudo em dia</Text>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                  Quando o status de combustível ou reserva mudar, aparece aqui.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const Icon = item.kind === 'fuel' ? Droplets : CalendarCheck;
              return (
                <TouchableOpacity
                  style={[
                    styles.item,
                    {
                      backgroundColor: colors.card,
                      borderColor: isDark ? colors.border : 'rgba(15,23,42,0.06)',
                    },
                    !item.read && styles.itemUnread,
                  ]}
                  onPress={() => openItem(item)}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      styles.itemIcon,
                      {
                        backgroundColor: isDark
                          ? 'rgba(239,68,68,0.14)'
                          : colors.iconBackground,
                      },
                    ]}
                  >
                    <Icon size={18} color={colors.primary} strokeWidth={2.1} />
                  </View>
                  <View style={styles.itemBody}>
                    <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text
                      style={[styles.itemBodyText, { color: colors.textSecondary }]}
                      numberOfLines={2}
                    >
                      {item.body}
                    </Text>
                    <Text style={[styles.itemTime, { color: colors.textSecondary }]}>
                      {formatRelativeTime(item.detectedAt || item.updatedAt)}
                    </Text>
                  </View>
                  {!item.read ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(15,23,42,0.35)',
    },
    sheet: {
      maxHeight: '78%',
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    handleWrap: { alignItems: 'center', marginBottom: 8 },
    handle: { width: 36, height: 4, borderRadius: 999 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      paddingHorizontal: 4,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.4,
    },
    closeBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listContent: { gap: 8, paddingBottom: 12 },
    emptyWrap: { flexGrow: 1, justifyContent: 'center', paddingVertical: 48 },
    empty: { alignItems: 'center', paddingHorizontal: 28 },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 6,
    },
    emptyText: {
      fontSize: 13,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 18,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      borderRadius: 16,
      padding: 14,
      borderWidth: StyleSheet.hairlineWidth,
    },
    itemUnread: {
      borderColor: 'rgba(206,55,54,0.28)',
    },
    itemIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    itemBody: { flex: 1, minWidth: 0 },
    itemTitle: {
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: -0.2,
      marginBottom: 3,
    },
    itemBodyText: {
      fontSize: 12.5,
      fontWeight: '500',
      lineHeight: 17,
      marginBottom: 6,
    },
    itemTime: {
      fontSize: 11,
      fontWeight: '600',
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginTop: 6,
    },
  });
