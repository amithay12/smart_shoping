const mongoose = require('mongoose');

/**
 * Store Model
 * Stores information about supermarkets/stores
 */
const storeSchema = new mongoose.Schema(
  {
    // Store name (e.g., "Walmart", "Target", "Kroger")
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // Store chain/brand (e.g., "Walmart", "Target")
    chain: {
      type: String,
      trim: true,
      index: true,
    },

    // Store address
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: {
        type: String,
        default: 'USA',
      },
      fullAddress: String, // Full formatted address
    },

    // Geographic coordinates for distance calculation
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },

    // Store phone number
    phone: {
      type: String,
    },

    // Store hours (optional)
    hours: {
      type: mongoose.Schema.Types.Mixed, // Flexible structure for different hours
    },

    // Store website
    website: {
      type: String,
    },

    // Is this store active/available for price comparison?
    isActive: {
      type: Boolean,
      default: true,
    },

    // Store type: 'physical' for physical supermarkets, 'online' for online stores
    storeType: {
      type: String,
      enum: ['physical', 'online'],
      default: 'physical',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Geospatial index for location-based queries
storeSchema.index({ location: '2dsphere' });

// Index for name searches
storeSchema.index({ name: 1, chain: 1 });

module.exports = mongoose.model('Store', storeSchema);

