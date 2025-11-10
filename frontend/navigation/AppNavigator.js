import React, { useContext } from 'react';

// 1. IMPORT NAVIGATION TOOLS
// We need these from the libraries we installed
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// 2. IMPORT OUR "GLOBAL BRAIN"
import { AuthContext } from '../context/AuthContext';

// 3. IMPORT OUR SCREENS
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import { View, ActivityIndicator } from 'react-native';

// 4. CREATE THE "STACKS" (Groups of Screens)
const Stack = createNativeStackNavigator();

// This is our main "Traffic Cop" component
export default function AppNavigator() {
  
  // 5. CHECK THE "GLOBAL BRAIN"
  // We get the `userToken` and `isLoading` state from our AuthContext
  const { userToken, isLoading } = useContext(AuthContext);

  // 6. SHOW A LOADING SPINNER
  // While the app is checking if you're logged in, show a spinner.
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size={'large'} />
      </View>
    );
  }

  // 7. THE "TRAFFIC COP" LOGIC
  // This is the most important part!
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {/*
          IF the userToken is null (not logged in),
          show the "Login" screen.
        
          ELSE (userToken exists),
          show the "Home" screen.
        */}
        {userToken == null ? (
          // "Auth Stack" (Logged Out)
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          // "App Stack" (Logged In)
          <Stack.Screen name="Home" component={HomeScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}