import { DeviceEventEmitter, EmitterSubscription } from 'react-native';

export const TAB_BAR_COLLAPSE = 'tabbar:collapse';
export const TAB_BAR_EXPAND = 'tabbar:expand';

export function emitTabBarCollapse() {
  DeviceEventEmitter.emit(TAB_BAR_COLLAPSE);
}

export function emitTabBarExpand() {
  DeviceEventEmitter.emit(TAB_BAR_EXPAND);
}

export function onTabBarCollapse(handler: () => void): EmitterSubscription {
  return DeviceEventEmitter.addListener(TAB_BAR_COLLAPSE, handler);
}

export function onTabBarExpand(handler: () => void): EmitterSubscription {
  return DeviceEventEmitter.addListener(TAB_BAR_EXPAND, handler);
}
