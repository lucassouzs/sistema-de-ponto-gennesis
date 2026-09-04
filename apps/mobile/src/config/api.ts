import Constants from 'expo-constants';
import { Platform } from 'react-native';

/** Backend de produção (Play Store / builds release). */
const PRODUCTION_API = 'https://sistema-pontobackend-production.up.railway.app';

/** IP do PC na Wi-Fi — só para desenvolvimento com `__DEV__` (Expo Go no celular). */
const LOCAL_LAN_API = 'http://192.168.15.93:5000';

function normalizeBaseUrl(url: string) {
  return url.replace(/\/$/, '');
}

function isRemoteProductionUrl(url: string) {
  return /railway\.app|gennesisconecta\.com/i.test(url);
}

const getApiBaseUrl = () => {
  if (Platform.OS === 'web') {
    return __DEV__ ? 'http://localhost:5000' : PRODUCTION_API;
  }

  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  const fromExtra = (Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL as string | undefined)?.trim();
  const configured = fromEnv || fromExtra;

  // Expo Go / metro: sempre backend local. Ignore Railway vindo do app.json/eas.
  if (__DEV__) {
    if (configured && !isRemoteProductionUrl(configured)) {
      return normalizeBaseUrl(configured);
    }
    return normalizeBaseUrl(LOCAL_LAN_API);
  }

  if (configured) {
    return normalizeBaseUrl(configured);
  }

  return normalizeBaseUrl(PRODUCTION_API);
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
