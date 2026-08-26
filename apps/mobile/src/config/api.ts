import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** IP do PC na Wi-Fi — celular precisa alcançar esse host na porta 5000 */
const LOCAL_LAN_API = 'http://192.168.15.93:5000';

const getApiBaseUrl = () => {
  if (Platform.OS === 'web') {
    return 'http://localhost:5000';
  }

  // Native: prioriza API local (dev no celular). Troque de volta p/ Railway ao publicar.
  const fromExtra = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL as string | undefined;
  if (fromExtra?.includes('192.168.') || fromExtra?.includes('localhost')) {
    return fromExtra.replace(/\/$/, '');
  }

  return LOCAL_LAN_API;
};

export const API_CONFIG = {
  BASE_URL: getApiBaseUrl(),
  ENDPOINTS: {
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    PROFILE: '/api/auth/profile',
    PUNCH: '/api/time-records/punch',
    MY_RECORDS: '/api/time-records/my-records',
    BANK_HOURS: '/api/time-records/my-records/bank-hours',
  },
};

export const buildApiUrl = (path: string) => `${API_CONFIG.BASE_URL}${path}`;
