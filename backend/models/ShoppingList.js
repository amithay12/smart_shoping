const mongoose = require('mongoose');

// This is the blueprint for an individual item *on* the list.
// Notice it's a Schema, but we are NOT making it a separate model.
// This is called an "Embedded Document" or "Subdocument".
const shoppingListItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  quantity: {
    type: String, // Using String for "1", "2 kg", "1 pack", etc.
    default: '1',
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  isPurchased: {
    type: Boolean,
    default: false,
  },
  // We add timestamps here too, so we know when this specific item was added
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// This is the blueprint for the main Shopping List.
const shoppingListSchema = new mongoose.Schema(
  {
    // The link to the household this list belongs to.
    // This is a 1-to-1 link (one household has one list).
    household: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Household',
      required: true,
      unique: true,
    },

    // This is the most important part.
    // It's an array that contains items based on the
    // blueprint we defined above (shoppingListItemSchema).
    items: [shoppingListItemSchema],
  },
  {
    // Adds `createdAt` and `updatedAt` to the list itself
    timestamps: true,
  }
);

module.exports = mongoose.model('ShoppingList', shoppingListSchema);
