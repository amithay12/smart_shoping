// טעינת משתני סביבה מקובץ .env
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const initializeFirebase = require('./config/firebaseAdmin');

// התחברות לבסיס הנתונים
connectDB();

// אתחול Firebase Admin
initializeFirebase();

// יצירת אפליקציית Express
const app = express();

// הפעלת CORS (Cross-Origin Resource Sharing)
// זה מאפשר לאפליקציית React Native שלנו לתקשר עם השרת
app.use(cors());

// הפעלת מנתח JSON מובנה ב-Express
// זה מאפשר לשרת לקרוא JSON מגוף הבקשה
app.use(express.json());

// נתיב (Route) בדיקה בסיסי
app.get('/', (req, res) => {
  res.json({ message: 'Smart Shopping List API is running!' });
});

// הגדרת הפורט
const PORT = process.env.PORT || 5000;

// הפעלת השרת
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
