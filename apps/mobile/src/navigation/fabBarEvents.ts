import { DeviceEventEmitter, EmitterSubscription } from 'react-native';

export const FAB_BAR_PRESS = 'fabbar:press';

export type FabBarTabName = 'Combustivel' | 'Reservas' | 'Perfil';

export function emitFabBarPress(tab: FabBarTabName) {
  DeviceEventEmitter.emit(FAB_BAR_PRESS, tab);
}

export function onFabBarPress(
  tab: FabBarTabName,
  handler: () => void,
): EmitterSubscription {
  return DeviceEventEmitter.addListener(FAB_BAR_PRESS, (pressed: FabBarTabName) => {
    if (pressed === tab) handler();
  });
}
