import React from 'react';
import { View, ActivityIndicator, Image, Animated, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import PunchScreen from './src/screens/PunchScreen';
import TimeRecordsScreen from './src/screens/TimeRecordsScreen';

// Navigation
import BottomTabNavigator from './src/navigation/BottomTabNavigator';

// Context
import { AuthProvider, useAuth } from './src/context/AuthContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';

// Tipagem opcional para o Stack
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Punch: undefined;
  TimeRecords: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const queryClient = new QueryClient();

function AppNavigator() {
  const { isAuthenticated, loading } = useAuth();
  const { colors, isDark } = useTheme();
  const [showSplash, setShowSplash] = React.useState(true);
  const fadeAnim = React.useRef(new Animated.Value(1)).current;
  const scaleAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const timer = setTimeout(() => {
      // Inicia animação de scale + fade out
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.5, // Aumenta 20%
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowSplash(false);
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [fadeAnim, scaleAnim]);

  if (showSplash || loading) {
    return (
      <View style={{ 
        flex: 1, 
        justifyContent: 'center', 
        alignItems: 'center', 
        backgroundColor: isDark ? colors.background : colors.headerBackground
      }}>
        <Animated.View style={{ 
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }]
        }}>
          <Image 
            source={require('./assets/logobranca.png')} 
            style={{ width: 200, height: 100 }}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Main" component={BottomTabNavigator} />
            <Stack.Screen name="Punch" component={PunchScreen} />
            <Stack.Screen name="TimeRecords" component={TimeRecordsScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function StatusBarComponent() {
  const { isDark, colors } = useTheme();

  React.useEffect(() => {
    if (Platform.OS === 'android') {
      // Removido setBackgroundColorAsync devido ao edge-to-edge
      NavigationBar.setButtonStyleAsync(isDark ? 'light' : 'dark');
    }
  }, [isDark]);

  return <StatusBar style={isDark ? 'light' : 'dark'} />;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <AppNavigator />
            <StatusBarComponent />
            <Toast />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
