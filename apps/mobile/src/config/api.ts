import Constants from 'expo-constants';
import { Platform } from 'react-native';

const getApiBaseUrl = () => {
  // Default to localhost for web development
  if (Platform.OS === 'web') {
    return 'http://localhost:5000';
  }

  // For Android emulator - usar Railway em produção
  if (__DEV__ && Platform.OS === 'android') {
    return 'https://sistema-pontobackend-production.up.railway.app';
  }

  // For iOS simulator or physical device in development
  if (__DEV__ && Platform.OS === 'ios') {
    // Use your computer's IP address for physical device
    // Change this to your computer's IP if needed
    return 'http://192.168.15.124:5000';
  }

  // For physical device in production
  // Ensure EXPO_PUBLIC_API_URL is set in app.json or as an environment variable
  const apiUrl = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_URL;
  if (apiUrl) {
    return apiUrl;
  }

  // Fallback for production if not explicitly set
  return 'https://sistema-pontobackend-production.up.railway.app'; // Railway URL
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
