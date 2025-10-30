const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectDB = require('./config/db');
const initializeFirebaseAdmin = require('./config/firebaseAdmin');

// Load env vars
dotenv.config({ path: './.env' });

// Initialize Firebase Admin
try {
  initializeFirebaseAdmin();
} catch (error) {
  console.error('Error initializing Firebase Admin:', error.message);
  // We don't want to crash the whole server if Firebase fails on start
  // But we will log it.
}

// Connect to Database
connectDB();

const app = express();

// Body Parser Middleware (allows us to accept JSON data)
app.use(express.json());

// Enable CORS (so our app can talk to our server)
app.use(cors());

// --- Define Routes ---
// We tell Express: "For any URL that starts with '/api/auth',
// hand it off to our new 'authRoutes' file."
app.use('/api/auth', require('./routes/auth'));
// We will add more routes here (e.g., /api/list, /api/household)

// --- End of Routes ---

const PORT = process.env.PORT || 5000;

// We save the server instance
const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled promise rejections (like DB connection errors)
// This is a safety net that prevents the server from crashing badly
process.on('unhandledRejection', (err, promise) => {
  console.error(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

