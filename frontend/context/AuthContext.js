import React, { createContext, useState, useEffect } from 'react';
import { Alert } from 'react-native'; // הוספנו Alert
import { auth } from '../firebaseConfig'; // מייבאים את הגדרות הפיירבייס שלנו
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut, // פונקציה חדשה להתנתקות
  sendPasswordResetEmail,
} from 'firebase/auth';
import axios from 'axios';

// זה ה-IP המיוחד שמאפשר לאמולטור לדבר עם ה-localhost של המחשב שלך
const API_URL = 'http://10.0.2.2:5001';

// 1. יצירת ה"מוח" (ה-Context)
export const AuthContext = createContext();

// 2. יצירת ה"ספק" (Provider) - זה הרכיב שיעטוף את כל האפליקציה
export const AuthProvider = ({ children }) => {
  const [userToken, setUserToken] = useState(null); // האם המשתמש מחובר? (מחזיק טוקן)
  const [userInfo, setUserInfo] = useState(null);   // מי המשתמש המחובר? (מחזיק את פרטי המשתמש מה-DB)
  const [isLoading, setIsLoading] = useState(false); // האם אנחנו באמצע טעינה?

  // פונקציית ההרשמה - כמעט זהה למה שהיה ב-LoginScreen
  const signUp = async (email, password) => {
    setIsLoading(true);
    try {
      // Validate and trim email
      const trimmedEmail = email?.trim();
      if (!trimmedEmail) {
        setIsLoading(false);
        Alert.alert('Error', 'Please enter a valid email address');
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setIsLoading(false);
        Alert.alert('Error', 'Please enter a valid email address');
        return;
      }

      // Validate password
      if (!password || password.length < 6) {
        setIsLoading(false);
        Alert.alert('Error', 'Password must be at least 6 characters');
        return;
      }

      // שלב 1: יצירת משתמש בפיירבייס
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        trimmedEmail,
        password
      );
      const user = userCredential.user;
      const token = await user.getIdToken();

      // שלב 2: יצירת משתמש ב-DB שלנו (קריאה ל-API שלנו)
      const response = await axios.post(
        `${API_URL}/api/auth/register-or-login`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // שלב 3: שמירת הפרטים ב"מוח" הגלובלי
      setUserInfo(response.data.user);
      setUserToken(token);
      setIsLoading(false);
      Alert.alert('Success!', 'Your account has been created.'); // נוסיף Alert הצלחה
    } catch (error) {
      setIsLoading(false);
      console.error('Sign Up Error:', error);
      
      // Handle Firebase auth errors with user-friendly messages
      let errorMessage = 'An error occurred during sign up';
      if (error.code) {
        switch (error.code) {
          case 'auth/invalid-email':
            errorMessage = 'Please enter a valid email address';
            break;
          case 'auth/email-already-in-use':
            errorMessage = 'This email is already registered. Please login instead.';
            break;
          case 'auth/weak-password':
            errorMessage = 'Password should be at least 6 characters';
            break;
          case 'auth/network-request-failed':
            errorMessage = 'Network error. Please check your connection.';
            break;
          default:
            errorMessage = error.message || 'An error occurred during sign up';
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Sign Up Error', errorMessage);
    }
  };

  // פונקציית ההתחברות - כמעט זהה למה שהיה ב-LoginScreen
  const login = async (email, password) => {
    setIsLoading(true);
    try {
      // Validate and trim email
      const trimmedEmail = email?.trim();
      if (!trimmedEmail) {
        setIsLoading(false);
        Alert.alert('Error', 'Please enter a valid email address');
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        setIsLoading(false);
        Alert.alert('Error', 'Please enter a valid email address');
        return;
      }

      // Validate password
      if (!password || password.length === 0) {
        setIsLoading(false);
        Alert.alert('Error', 'Please enter your password');
        return;
      }

      // שלב 1: התחברות לפיירבייס
      const userCredential = await signInWithEmailAndPassword(
        auth,
        trimmedEmail,
        password
      );
      const user = userCredential.user;
      const token = await user.getIdToken();

      // שלב 2: קריאה ל-API שלנו (שיזהה שהמשתמש קיים)
      const response = await axios.post(
        `${API_URL}/api/auth/register-or-login`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // שלב 3: שמירת הפרטים ב"מוח" הגלובלי
      setUserInfo(response.data.user);
      setUserToken(token);
      setIsLoading(false);
      Alert.alert('Success!', 'Logged in successfully.'); // נוסיף Alert הצלחה
    } catch (error) {
      setIsLoading(false);
      console.error('Login Error:', error);
      
      // Handle Firebase auth errors with user-friendly messages
      let errorMessage = 'An error occurred during login';
      if (error.code) {
        switch (error.code) {
          case 'auth/invalid-email':
            errorMessage = 'Please enter a valid email address';
            break;
          case 'auth/user-not-found':
            errorMessage = 'No account found with this email. Please sign up.';
            break;
          case 'auth/wrong-password':
            errorMessage = 'Incorrect password. Please try again.';
            break;
          case 'auth/invalid-credential':
            errorMessage = 'Invalid email or password. Please try again.';
            break;
          case 'auth/network-request-failed':
            errorMessage = 'Network error. Please check your connection.';
            break;
          default:
            errorMessage = error.message || 'An error occurred during login';
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      Alert.alert('Login Error', errorMessage);
    }
  };

  // פונקציה חדשה להתנתקות
  const logout = async () => {
    setIsLoading(true);
    try {
      await signOut(auth); // פקודת התנתקות מפיירבייס
      // ניקוי ה"מוח" הגלובלי
      setUserToken(null);
      setUserInfo(null);
      setIsLoading(false);
    } catch (error) {
      setIsLoading(false);
      console.error('Logout Error:', error.message);
      Alert.alert('Logout Error', error.message);
    }
  };

  const resetPassword = async (email) => {
    try {
      const trimmedEmail = email?.trim();
      if (!trimmedEmail) {
        Alert.alert('Error', 'Please enter your email first');
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmedEmail)) {
        Alert.alert('Error', 'Please enter a valid email address');
        return;
      }

      await sendPasswordResetEmail(auth, trimmedEmail);
      Alert.alert(
        'Reset link sent',
        'We have emailed you a link to reset your password.'
      );
    } catch (error) {
      console.error('Reset Password Error:', error);
      let errorMessage = 'Could not send reset email';

      if (error.code) {
        switch (error.code) {
          case 'auth/user-not-found':
            errorMessage = 'No account found with this email.';
            break;
          case 'auth/invalid-email':
            errorMessage = 'Please enter a valid email address';
            break;
          case 'auth/network-request-failed':
            errorMessage = 'Network error. Please check your connection.';
            break;
          default:
            errorMessage = error.message || errorMessage;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert('Reset Password Error', errorMessage);
    }
  };

  // 3. ה"ערך" (value) שה"מוח" הזה יספק לכל האפליקציה
  // כל רכיב בתוך האפליקציה יוכל לגשת למשתנים האלה
  return (
    <AuthContext.Provider
      value={{
        isLoading,
        userToken,
        userInfo,
        signUp,
        login,
        logout,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};