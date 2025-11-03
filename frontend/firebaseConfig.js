// Import the functions we will need
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDsjcEOxrHzBq-V3x_27MonN_Y_hxMW5Sg",
  authDomain: "savy-a1dc2.firebaseapp.com",
  projectId: "savy-a1dc2",
  storageBucket: "savy-a1dc2.firebasestorage.app",
  messagingSenderId: "734437037431",
  appId: "1:734437037431:web:63bf53b8b708ac53577d72",
  measurementId: "G-3GS42PH76P"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and export it
export const auth = getAuth(app);

