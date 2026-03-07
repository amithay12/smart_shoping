const mongoose = require('mongoose');

// This is the blueprint for our "log book".
// Every time a user does *anything*, we create one of these.
const changeHistorySchema = new mongoose.Schema(
  {
    // Which household did this change happen in?
    household: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Household',
      required: true,
    },

    // Which user made the change?
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // What did they do? (e.g., "ADD_ITEM", "REMOVE_ITEM", "UPDATE_QUANTITY", "PURCHASE_ITEM")
    action: {
      type: String,
      required: true,
      enum: [
        'ADD_ITEM',
        'REMOVE_ITEM',
        'UPDATE_ITEM',
        'PURCHASE_ITEM',
        'UNDO_PURCHASE',
        'CLEAR_LIST',
      ],
    },

    // Details about the item that was changed.
    // We store the name/quantity directly so the log makes sense
    // even if the item is deleted from the list later.
    itemDetails: {
      name: String,
      quantity: String,
      // Product reference for recommendation system
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
      // Barcode for product matching
      barcode: String,
    },

    // This is for the "UNDO" feature. We can store the *previous* state.
    // For example, if action is "UPDATE_ITEM", this could be { quantity: '1' }
    // We make this flexible so we can store whatever we need.
    previousState: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    // We *only* need the `createdAt` timestamp for a log.
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// This tells MongoDB to create an index on `household` and `createdAt`.
// This will make it *much faster* to find all the history for
// a specific household and show it in chronological order.
changeHistorySchema.index({ household: 1, createdAt: -1 });

// Indexes for recommendation system performance
// Index for finding purchases by action and barcode
changeHistorySchema.index({ action: 1, 'itemDetails.barcode': 1, createdAt: -1 });
// Index for finding purchases by action and product
changeHistorySchema.index({ action: 1, 'itemDetails.product': 1, createdAt: -1 });
// Index for global association queries (finding purchases by household and time window)
changeHistorySchema.index({ household: 1, action: 1, createdAt: -1 });

module.exports = mongoose.model('ChangeHistory', changeHistorySchema);
