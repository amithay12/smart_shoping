const admin = require('../config/firebaseAdmin');
const User = require('../models/User');

// This middleware will run on almost every API request
exports.protect = async (req, res, next) => {
  let token;

  // 1. Check if the token was sent in the 'authorization' header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // 2. Get the token (the part *after* "Bearer ")
      token = req.headers.authorization.split('Bearer ')[1];

      // 3. Verify the token with Firebase
      const decodedToken = await admin.auth().verifyIdToken(token);

      // 4. Find the user in OUR database using the Firebase UID
      const user = await User.findOne({ firebaseUid: decodedToken.uid });

      if (!user) {
        return res.status(404).json({ message: 'User not found in our database' });
      }

      // 5. SUCCESS! Attach the user's data to the request object
      // Now, every *next* function can just use "req.user"
      req.user = user;

      // 6. Tell Express to move on to the next function (the real controller)
      next();
    } catch (error) {
      console.error('Error verifying token:', error);
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Not authorized, no token' });
  }
};
