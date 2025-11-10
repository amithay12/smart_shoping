import React, { useState, useContext } from 'react'; // NEW: We import useContext
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// --- NEW IMPORTS ---
// We import our "global brain"
import { AuthContext } from '../context/AuthContext';
// -------------------

// We have DELETED the imports for firebase, axios, and API_URL.
// This file no longer needs to know about them!

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // --- NEW: We "consume" the global brain ---
  // This line "pulls in" the functions and variables
  // that our AuthProvider is providing.
  const { isLoading, signUp, login } = useContext(AuthContext);
  // ----------------------------------------

  // --- We DELETED the old, long handleSignUp and handleLogin functions ---

  // We just have simple "wrapper" functions now.
  // These functions are much cleaner!
  const handleSignUpPress = () => {
    // Just call the function from the context!
    signUp(email, password);
  };

  const handleLoginPress = () => {
    // Just call the function from the context!
    login(email, password);
  };

  // The JSX (the UI) is almost identical.
  // We just changed the 'onPress' props.
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <Text style={styles.title}>Welcome to Savy!</Text>
      <Text style={styles.subtitle}>Sign in or create an account</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {isLoading ? (
        <ActivityIndicator size="large" color="#28a745" style={{ marginTop: 20 }} />
      ) : (
        <>
          <TouchableOpacity style={styles.button} onPress={handleLoginPress}>
            <Text style={styles.buttonText}>Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonOutline]}
            onPress={handleSignUpPress}
          >
            <Text style={styles.buttonOutlineText}>Sign Up</Text>
          </TouchableOpacity>
        </>
      )}
    </SafeAreaView>
  );
}

// The styles are 100% unchanged.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: 'gray',
    marginBottom: 30,
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#f2f2f2',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 15,
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#28a745', // Green color
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#28a745',
  },
  buttonOutlineText: {
    color: '#28a745',
    fontSize: 18,
    fontWeight: 'bold',
  },
});