import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import FloatingTabBar from './FloatingTabBar';

import FuelRequestsScreen from '../screens/FuelRequestsScreen';
import VehicleReservationsScreen from '../screens/VehicleReservationsScreen';
import ProfileScreen from '../screens/ProfileScreen';

export type BottomTabParamList = {
  Combustivel: undefined;
  Reservas: undefined;
  Perfil: undefined;
};

const Tab = createBottomTabNavigator<BottomTabParamList>();

export default function BottomTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Combustivel"
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
        name="Combustivel"
        component={FuelRequestsScreen}
        options={{ title: 'Combustível' }}
      />
      <Tab.Screen
        name="Reservas"
        component={VehicleReservationsScreen}
        options={{ title: 'Reservas' }}
      />
      <Tab.Screen
        name="Perfil"
        component={ProfileScreen}
        options={{ title: 'Perfil' }}
      />
    </Tab.Navigator>
  );
}
