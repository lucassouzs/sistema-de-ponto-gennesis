import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { ActivityNotification } from './activityStorage';

const ANDROID_CHANNEL_ID = 'gennesis-activity';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let permissionsReady: Promise<boolean> | null = null;

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Atualizações',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 120, 250],
    lightColor: '#ce3736',
    sound: 'default',
  });
}

export async function ensureSystemNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  if (!permissionsReady) {
    permissionsReady = (async () => {
      try {
        await ensureAndroidChannel();
        const current = await Notifications.getPermissionsAsync();
        let status = current.status;
        if (status !== 'granted') {
          const requested = await Notifications.requestPermissionsAsync();
          status = requested.status;
        }
        return status === 'granted';
      } catch {
        return false;
      }
    })();
  }
  return permissionsReady;
}

export async function presentSystemNotification(item: ActivityNotification) {
  if (Platform.OS === 'web') return;
  const ok = await ensureSystemNotificationPermissions();
  if (!ok) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: item.title,
        body: item.body,
        sound: true,
        data: {
          notificationId: item.id,
          entityId: item.entityId,
          kind: item.kind,
          status: item.status,
        },
        ...(Platform.OS === 'android'
          ? { channelId: ANDROID_CHANNEL_ID, color: '#ce3736' }
          : {}),
      },
      trigger: null,
    });
  } catch {
    // não quebrar o fluxo do app se a notificação do SO falhar
  }
}

export async function presentSystemNotifications(items: ActivityNotification[]) {
  for (const item of items) {
    await presentSystemNotification(item);
  }
}

export async function syncAppIconBadge(count: number) {
  if (Platform.OS === 'web') return;
  try {
    const ok = await ensureSystemNotificationPermissions();
    if (!ok) return;
    await Notifications.setBadgeCountAsync(Math.max(0, count));
  } catch {
    // ignore
  }
}
