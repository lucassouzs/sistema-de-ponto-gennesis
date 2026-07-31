import React from 'react';
import { View, Platform, Animated, Easing } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import LoginScreen from './src/screens/LoginScreen';
import PunchScreen from './src/screens/PunchScreen';
import TimeRecordsScreen from './src/screens/TimeRecordsScreen';
import FuelRequestsScreen from './src/screens/FuelRequestsScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import PncpLicitacoesScreen from './src/screens/PncpLicitacoesScreen';
import AuthBrandSplash, { SPLASH_BG } from './src/components/AuthBrandSplash';

import BottomTabNavigator from './src/navigation/BottomTabNavigator';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { NotificationsProvider } from './src/notifications/NotificationsContext';
import NotificationsSheet from './src/components/NotificationsSheet';

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Punch: undefined;
  TimeRecords: undefined;
  FuelRequests: undefined;
  Profile: undefined;
  Pncp: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const queryClient = new QueryClient();

const MIN_SPLASH_MS = 1600;

function AppNavigator() {
  const { isAuthenticated, loading } = useAuth();
  const { colors } = useTheme();
  const [minSplashDone, setMinSplashDone] = React.useState(false);
  const [bootFade] = React.useState(() => new Animated.Value(1));
  const [showBootSplash, setShowBootSplash] = React.useState(true);

  React.useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  const bootReady = minSplashDone && !loading;

  React.useEffect(() => {
    if (!bootReady || !showBootSplash) return;

    if (isAuthenticated) {
      Animated.timing(bootFade, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => setShowBootSplash(false));
      return;
    }

    // Login: tira o splash sem fade (o Login já começa com a mesma frame).
    // Assim a logo não “pula” na passagem.
    setShowBootSplash(false);
  }, [bootReady, bootFade, isAuthenticated, showBootSplash]);

  if (showBootSplash && !bootReady) {
    return <AuthBrandSplash />;
  }

  // Autenticado ainda com splash sumindo
  if (showBootSplash && isAuthenticated) {
    return (
      <View style={{ flex: 1 }}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Main" component={BottomTabNavigator} />
          </Stack.Navigator>
        </NavigationContainer>
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: bootFade,
            zIndex: 50,
          }}
        >
          <AuthBrandSplash />
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: isAuthenticated ? colors.background : SPLASH_BG }}>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: isAuthenticated ? colors.background : SPLASH_BG,
            },
            animation: 'slide_from_right',
          }}
        >
          {isAuthenticated ? (
            <>
              <Stack.Screen name="Main" component={BottomTabNavigator} />
              <Stack.Screen name="Punch" component={PunchScreen} />
              <Stack.Screen name="TimeRecords" component={TimeRecordsScreen} />
              <Stack.Screen name="FuelRequests" component={FuelRequestsScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
              <Stack.Screen name="Pncp" component={PncpLicitacoesScreen} />
            </>
          ) : (
            <Stack.Screen name="Login">
              {() => <LoginScreen fromBootSplash />}
            </Stack.Screen>
          )}
        </Stack.Navigator>
        {isAuthenticated ? <NotificationsSheet /> : null}
      </NavigationContainer>
    </View>
  );
}

function StatusBarComponent() {
  const { isDark } = useTheme();
  const { isAuthenticated, loading } = useAuth();
  const onAuthSurface = !loading && !isAuthenticated;
  const barStyle = onAuthSurface || isDark ? 'light' : 'dark';

  React.useEffect(() => {
    if (Platform.OS === 'android') {
      NavigationBar.setButtonStyleAsync(barStyle === 'light' ? 'light' : 'dark');
    }
  }, [barStyle]);

  return <StatusBar style={barStyle} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <NotificationsProvider>
              <AppNavigator />
              <StatusBarComponent />
              <Toast />
            </NotificationsProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
