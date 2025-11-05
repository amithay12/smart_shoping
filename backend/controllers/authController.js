const admin = require('firebase-admin'); // Our Firebase connection
const User = require('../models/User'); // Our User "blueprint"
const Household = require('../models/Household'); // Our Household "blueprint"
const ShoppingList = require('../models/ShoppingList'); // Our ShoppingList "blueprint"

// This is an "async" function, meaning it can "wait" for database operations
exports.registerOrLoginUser = async (req, res) => {
  // 1. Get the Firebase token from the app's request
  // The app will send it in the "Authorization" header
  const idToken = req.headers.authorization?.split('Bearer ')[1];

  if (!idToken) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    // 2. Verify the token with Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const { uid, email, name } = decodedToken;

    // 3. Check if this user (with this firebaseUid) already exists in our database
    let user = await User.findOne({ firebaseUid: uid });

    // 4. IF the user EXISTS (This is a LOGIN)
    if (user) {
      // User exists, just return their data
      return res.status(200).json({
        message: 'User logged in successfully',
        user: user,
      });
    }

    // 5. IF the user does NOT exist (This is a REGISTRATION)
    // We need to create a new User, a new Household, and a new ShoppingList

    // 5a. Create the new User
    const newUser = new User({
      firebaseUid: uid,
      email: email,
      displayName: name, // This might be null if they signed up with email
    });

    // 5b. Create a new Household for this user
    const newHousehold = new Household({
      name: `${name || email}'s Household`, // e.g., "Amit's Household"
      members: [newUser._id], // Add the new user's ID to the members list
    });

    // 5c. Create a new Shopping List for this household
    const newShoppingList = new ShoppingList({
      household: newHousehold._id, // Link the list to the new household
      items: [], // Start with an empty list
    });

    // 5d. Link the user to the new household
    newUser.household = newHousehold._id;

    // 5e. Save everything to the database (we use "Promise.all" to do it at the same time)
    await Promise.all([
      newUser.save(),
      newHousehold.save(),
      newShoppingList.save(),
    ]);

    // 6. Return the new user's data
    return res.status(201).json({
      message: 'User registered successfully',
      user: newUser,
    });
  } catch (error) {
    console.error('Error in registerOrLoginUser:', error);
    return res.status(500).json({ message: 'Error authenticating user', error: error.message });
  }
};
