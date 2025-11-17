import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthContext } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';

// --- THIS IS THE CHANGE ---
// We now import our new TabNavigator...
import TabNavigator from './TabNavigator'; 
// ...and we no longer need to import the individual screens here.
// --------------------------

import { View, ActivityIndicator } from 'react-native';

// 4. CREATE THE STACK
const Stack = createNativeStackNavigator();

// This is our main "Traffic Cop" component
export default function AppNavigator() {
  
  // 5. CHECK THE "GLOBAL BRAIN" (Same as before)
  const { userToken, isLoading } = useContext(AuthContext);

  // 6. SHOW A LOADING SPINNER (Same as before)
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size={'large'} />
      </View>
    );
  }

  // 7. THE "TRAFFIC COP" LOGIC (This is the key change)
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {userToken == null ? (
          // "Auth Stack" (Logged Out)
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          // "App Stack" (Logged In)
          // --- THIS IS THE CHANGE ---
          // Instead of showing just one screen,
          // we now show our *entire* TabNavigator component.
          <Stack.Screen name="App" component={TabNavigator} />
          // --------------------------
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}