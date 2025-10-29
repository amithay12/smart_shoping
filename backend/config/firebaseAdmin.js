const admin = require('firebase-admin');

const initializeFirebase = () => {
  try {
    // קריאת הנתיב לקובץ הגדרות ה-Service Account
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    
    if (!serviceAccountPath) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_PATH is not defined in .env');
    }

    const serviceAccount = require(serviceAccountPath);

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
