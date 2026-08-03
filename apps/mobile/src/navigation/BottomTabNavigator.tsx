import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import FloatingTabBar from './FloatingTabBar';

import HomeScreen from '../screens/HomeScreen';
import FuelRequestsScreen from '../screens/FuelRequestsScreen';
import VehicleReservationsScreen from '../screens/VehicleReservationsScreen';
import DpRequestsScreen from '../screens/DpRequestsScreen';
import { usePermissions } from '../hooks/usePermissions';

export type BottomTabParamList = {
  Home: undefined;
  Combustivel: undefined;
  Reservas: undefined;
  DpRequests: undefined;
};

const Tab = createBottomTabNavigator<BottomTabParamList>();

export default function BottomTabNavigator() {
  const { canSeeCombustivel, canSeeReservas, canSeeDpRequests } = usePermissions();

  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <FloatingTabBar {...props} />}
      sceneContainerStyle={{
        backgroundColor: 'transparent',
      }}
      screenOptions={{
        headerShown: false,
        lazy: false,
        tabBarStyle: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
          height: 'auto',
        },
        tabBarBackground: () => null,
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Início' }}
      />
      {canSeeCombustivel ? (
        <Tab.Screen
          name="Combustivel"
          component={FuelRequestsScreen}
          options={{ title: 'Combustível' }}
        />
      ) : null}
      {canSeeReservas ? (
        <Tab.Screen
          name="Reservas"
          component={VehicleReservationsScreen}
          options={{ title: 'Reservas' }}
        />
      ) : null}
      {canSeeDpRequests ? (
        <Tab.Screen
          name="DpRequests"
          component={DpRequestsScreen}
          options={{ title: 'Solicitações' }}
        />
      ) : null}
    </Tab.Navigator>
  );
}
