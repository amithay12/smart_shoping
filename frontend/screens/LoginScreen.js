import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator, // NEW: We will show a loading spinner
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; // We're using the new one!

// --- NEW IMPORTS ---
// Import our Firebase app configuration
import { auth } from '../firebaseConfig';
// Import the functions we need from the Firebase SDK
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from 'firebase/auth';
// Import axios to talk to our backend API
import axios from 'axios';
// -------------------

// --- NEW API URL ---
// This is the MOST IMPORTANT new part.
// 'localhost' refers to the emulator's *own* internal 'localhost'.
// To connect from the emulator back to your Mac (where your server is running),
// Android provides a special, magic IP address: 10.0.2.2
const API_URL = 'http://10.0.2.2:5001';
// -------------------

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // NEW: A state to track when we are "loading"
  const [isLoading, setIsLoading] = useState(false);

  // --- NEW SIGN UP FUNCTION ---
  const handleSignUp = async () => {
    // Check if fields are empty
    if (email === '' || password === '') {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }
    setIsLoading(true); // Show the loading spinner

    try {
      // Step 1: Create the user in Firebase Authentication
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // Step 2: Get the user's secret ID Token from Firebase
      // This token *proves* who they are.
      const token = await user.getIdToken();

      // Step 3: Send this token to our OWN backend API
      // Our backend API will verify the token and create the
      // user in our MongoDB database.
      const response = await axios.post(
        `${API_URL}/api/auth/register-or-login`,
        {}, // We don't need to send any data in the body
        {
          headers: {
            // We send the token in the 'Authorization' header
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setIsLoading(false); // Hide the loading spinner
      Alert.alert('Success!', 'Your account has been created.');
      // In the future, we will navigate to the main app screen here
      console.log(response.data); // Log the new user data from our backend

    } catch (error) {
      setIsLoading(false); // Hide the loading spinner
      console.error(error); // Log the full error to your terminal
      // Show a user-friendly error
      Alert.alert('Sign Up Error', error.message);
    }
  };

  // --- NEW LOGIN FUNCTION ---
  const handleLogin = async () => {
    if (email === '' || password === '') {
      Alert.alert('Error', 'Please enter both email and password.');
      return;
    }
    setIsLoading(true);

    try {
      // Step 1: Sign in the user with Firebase
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      // Step 2: Get the user's token
      const token = await user.getIdToken();

      // Step 3: Send the token to our backend.
      // The *same* API endpoint will recognize that the user
      // already exists in our DB and will just return their data.
      const response = await axios.post(
        `${API_URL}/api/auth/register-or-login`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setIsLoading(false);
      Alert.alert('Success!', 'Logged in successfully.');
      // In the future, we will navigate to the main app screen here
      console.log(response.data); // Log the user data from our backend

    } catch (error) {
      setIsLoading(false);
      console.error(error);
      Alert.alert('Login Error', error.message);
    }
  };

  // --- NEW JSX TO SHOW SPINNER ---
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

      {/* This is a "ternary" operator.
          IF 'isLoading' is true, it shows the ActivityIndicator.
          ELSE (:) it shows our buttons.
      */}
      {isLoading ? (
        <ActivityIndicator size="large" color="#28a745" style={{ marginTop: 20 }} />
      ) : (
        <>
          <TouchableOpacity style={styles.button} onPress={handleLogin}>
            <Text style={styles.buttonText}>Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.buttonOutline]}
            onPress={handleSignUp}
          >
            <Text style={styles.buttonOutlineText}>Sign Up</Text>
          </TouchableOpacity>
        </>
      )}
    </SafeAreaView>
  );
}

// All the styles are exactly the same
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

