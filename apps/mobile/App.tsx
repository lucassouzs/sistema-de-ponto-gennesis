import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

// Screens
import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import PunchScreen from './src/screens/PunchScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import TimeRecordsScreen from './src/screens/TimeRecordsScreen';

// Context
import { AuthProvider, useAuth } from './src/context/AuthContext';

const Stack = createStackNavigator();
const queryClient = new QueryClient();

function AppNavigator() {
  const { isAuthenticated } = useAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
        }}
      >
        {isAuthenticated ? (
          <>
            <Stack.Screen name="Dashboard" component={DashboardScreen} />
            <Stack.Screen name="Punch" component={PunchScreen} />
            <Stack.Screen name="TimeRecords" component={TimeRecordsScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppNavigator />
        <StatusBar style="auto" />
        <Toast />
      </AuthProvider>
    </QueryClientProvider>
  );
}
