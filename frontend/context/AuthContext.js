import React, { createContext, useState, useEffect } from 'react';
import { Alert } from 'react-native'; // הוספנו Alert
import { auth } from '../firebaseConfig'; // מייבאים את הגדרות הפיירבייס שלנו
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut, // פונקציה חדשה להתנתקות
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
      // שלב 1: יצירת משתמש בפיירבייס
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
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
      console.error('Sign Up Error:', error.response ? error.response.data : error.message);
      Alert.alert('Sign Up Error', error.message);
    }
  };

  // פונקציית ההתחברות - כמעט זהה למה שהיה ב-LoginScreen
  const login = async (email, password) => {
    setIsLoading(true);
    try {
      // שלב 1: התחברות לפיירבייס
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
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
      console.error('Login Error:', error.response ? error.response.data : error.message);
      Alert.alert('Login Error', error.message);
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};