const mongoose = require('mongoose');

// This is the "blueprint" for a Household in our database.
const householdSchema = new mongoose.Schema(
  {
    // The name of the household (e.g., "The Hayot Family" or "Room 101")
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // This is the "link" back to the users.
    // It's an array (that's what the `[]` means) that will
    // store a list of all the User IDs that belong to this household.
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    // Automatically adds `createdAt` and `updatedAt` timestamps.
    timestamps: true,
  }
);

// This exports our blueprint as a model named 'Household'.
// Mongoose will create a collection named 'households' in MongoDB.
module.exports = mongoose.model('Household', householdSchema);