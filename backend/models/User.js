const mongoose = require('mongoose');

// This is the "blueprint" for a User in our database.
const userSchema = new mongoose.Schema(
  {
    // This is the unique ID we get from Firebase Authentication.
    // We use this to link our database user to the Firebase auth user.
    firebaseUid: {
      type: String,
      required: true,
      unique: true, // No two users can have the same Firebase ID
    },

    // The user's email address.
    email: {
      type: String,
      required: true,
      unique: true, // No two users can have the same email
      trim: true, // Removes whitespace from the beginning/end
    },

    // The user's display name (e.g., "Amit Hayot")
    displayName: {
      type: String,
      trim: true,
    },

    // This is the "link" to the household this user belongs to.
    // It will store the unique ID (_id) of a Household document.
    // The 'ref' tells Mongoose which model to link to.
    household: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Household',
    },
  },
  {
    // This is a magic shortcut.
    // Mongoose will automatically add `createdAt` and `updatedAt`
    // fields to our documents, which is great for tracking.
    timestamps: true,
  }
);

// This "exports" our blueprint as a model named 'User'.
// Mongoose will automatically create a collection named 'users' (plural, lowercase)
// in the MongoDB database.
module.exports = mongoose.model('User', userSchema);