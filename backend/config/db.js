const mongoose = require('mongoose');

// פונקציה אסינכרונית להתחברות לבסיס הנתונים
const connectDB = async () => {
  try {
    // קריאת מחרוזת החיבור מקובץ משתני הסביבה
    const conn = await mongoose.connect(process.env.MONGO_URI);

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    // יציאה מהתהליך עם כשלון
    process.exit(1);
  }
};

module.exports = connectDB;
