const mongoose = require('mongoose');

/**
 * StoreProduct Model
 * Links products to stores with pricing information
 * This is the core model for price comparison
 */
const storeProductSchema = new mongoose.Schema(
  {
    // Reference to the Product
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },

    // Reference to the Store
    store: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Store',
      required: true,
    },

    // Current price
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    // Currency (default USD)
    currency: {
      type: String,
      default: 'USD',
    },

    // Unit price (price per unit, e.g., price per 100g)
    unitPrice: {
      type: Number,
    },

    // Is product currently available at this store?
    isAvailable: {
      type: Boolean,
      default: true,
    },

    // Last time price was updated
    lastPriceUpdate: {
      type: Date,
      default: Date.now,
    },

    // Price history (optional - for tracking price changes)
    priceHistory: [
      {
        price: Number,
        date: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Special offers/discounts
    discount: {
      percentage: Number,
      description: String,
      validUntil: Date,
    },

    // Stock status
    inStock: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for fast lookups: product + store
storeProductSchema.index({ product: 1, store: 1 }, { unique: true });

// Index for price queries
storeProductSchema.index({ product: 1, price: 1 });
storeProductSchema.index({ store: 1, isAvailable: 1 });

// Index for last update
storeProductSchema.index({ lastPriceUpdate: 1 });

module.exports = mongoose.model('StoreProduct', storeProductSchema);

