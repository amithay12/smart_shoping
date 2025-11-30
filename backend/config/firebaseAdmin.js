const admin = require('firebase-admin');
const path = require('path');

const initializeFirebase = () => {
  try {
    // קריאת הנתיב לקובץ הגדרות ה-Service Account
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    
    if (!serviceAccountPath) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH is not defined in .env');
    }

    // Resolve path relative to backend directory
    // If path is absolute, use it directly
    // If path starts with './config/' or 'config/', resolve from backend directory
    // Otherwise, resolve from config directory (where this file is located)
    let resolvedPath;
    if (path.isAbsolute(serviceAccountPath)) {
      resolvedPath = serviceAccountPath;
    } else if (serviceAccountPath.startsWith('./config/') || serviceAccountPath.startsWith('config/')) {
      // Remove './config/' prefix and resolve from backend directory
      const fileName = serviceAccountPath.replace(/^\.\/config\//, '').replace(/^config\//, '');
      resolvedPath = path.join(__dirname, fileName);
    } else {
      // Path is relative to config directory (where this file is)
      resolvedPath = path.join(__dirname, serviceAccountPath);
    }
    
    const serviceAccount = require(resolvedPath);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    console.log('Firebase Admin SDK initialized successfully.');
  } catch (error) {
    console.error(`Error initializing Firebase Admin: ${error.message}`);
    // אנחנו לא יוצאים מהאפליקציה אם פיירבייס נכשל, 
    // אבל רושמים שגיאה חמורה.
  }
};

module.exports = initializeFirebase;
