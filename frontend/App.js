import React from 'react';

// --- THIS IS THE CRITICAL LINE ---
// This line *must* be here.
// It imports your firebaseConfig.js file, which runs
// the `initializeApp(firebaseConfig)` command.
// This is what "turns on" Firebase for your whole app.
import './firebaseConfig';


import LoginScreen from './screens/LoginScreen';

export default function App() {
  // Now, when LoginScreen is shown, Firebase will
  // already be initialized, and the error will be gone.
  return <LoginScreen />;
}

