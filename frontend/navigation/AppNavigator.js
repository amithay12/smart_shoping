import React, { useContext } from 'react';

// 1. IMPORT NAVIGATION TOOLS
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// 2. IMPORT OUR "GLOBAL BRAIN"
import { AuthContext } from '../context/AuthContext';

// 3. IMPORT OUR SCREENS
import LoginScreen from '../screens/LoginScreen';
// --- THIS IS THE CHANGE ---
// We now import our new ShoppingListScreen...
import ShoppingListScreen from '../screens/ShoppingListScreen';
// ...and we no longer need the old HomeScreen
// --------------------------
import { View, ActivityIndicator } from 'react-native';

// 4. CREATE THE "STACKS" (Groups of Screens)
const Stack = createNativeStackNavigator();

// This is our main "Traffic Cop" component
export default function AppNavigator() {
  
  // 5. CHECK THE "GLOBAL BRAIN"
  const { userToken, isLoading } = useContext(AuthContext);

  // 6. SHOW A LOADING SPINNER
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size={'large'} />
      </View>
    );
  }

  // 7. THE "TRAFFIC COP" LOGIC
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {userToken == null ? (
          // "Auth Stack" (Logged Out)
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          // "App Stack" (Logged In)
          // --- THIS IS THE CHANGE ---
          // We now show the ShoppingListScreen after login
          <Stack.Screen name="Home" component={ShoppingListScreen} />
          // --------------------------
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}