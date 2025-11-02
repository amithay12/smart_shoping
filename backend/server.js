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
}

// Connect to Database
connectDB();

const app = express();

// Body Parser Middleware (allows us to accept JSON data)
app.use(express.json());

// Enable CORS (so our app can talk to our server)
app.use(cors());

// --- Define Routes ---
// This is the auth route we already built
app.use('/api/auth', require('./routes/auth'));

// This is the list route we just built
app.use('/api/list', require('./routes/list'));

// THIS IS THE NEW LINE:
// For any URL starting with '/api/household', hand it to 'householdRoutes'.
app.use('/api/household', require('./routes/household'));

// --- End of Routes ---

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.error(`Error: ${err.message}`);
  server.close(() => process.exit(1));
});

