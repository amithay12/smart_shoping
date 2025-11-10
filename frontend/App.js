// We no longer need to import LoginScreen here!
// We only import our "Global Brain" and our "Traffic Cop"

import { AuthProvider } from './context/AuthContext';
import AppNavigator from './navigation/AppNavigator';

// This is our new, final App.js
export default function App() {
  return (
    // 1. "Turn on" the "Global Brain".
    // Any component inside this AuthProvider
    // can now access our 'userToken', 'userInfo', 'login', etc.
    <AuthProvider>
      
      {/* 2. Show the "Traffic Cop".
          AppNavigator will now decide which screen to show
          (Login or Home) based on the user's login status.
      */}
      <AppNavigator />

    </AuthProvider>
  );
}