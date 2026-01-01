const mongoose = require('mongoose');

/**
 * Product Model
 * Stores product information including barcode, name, category, etc.
 * This allows us to link shopping list items to real products
 */
const productSchema = new mongoose.Schema(
  {
    // Barcode (UPC/EAN/GTIN) - unique identifier
    barcode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true, // Index for fast lookups
    },

    // Product name
    name: {
      type: String,
      required: true,
      trim: true,
      index: true, // Index for text search
    },

    // Brand name (optional)
    brand: {
      type: String,
      trim: true,
    },

    // Product category (e.g., "Dairy", "Beverages", "Snacks")
    category: {
      type: String,
      trim: true,
      index: true,
    },

    // Product image URL
    imageUrl: {
      type: String,
    },

    // Standard unit (e.g., "ml", "g", "pieces")
    unit: {
      type: String,
      default: 'piece',
    },

    // Standard size/quantity (e.g., "500ml", "1kg")
    size: {
      type: String,
    },

    // Additional metadata from barcode lookup APIs
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },

    // Source of product data (e.g., "openfoodfacts", "manual")
    dataSource: {
      type: String,
      default: 'manual',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for name + brand searches
productSchema.index({ name: 1, brand: 1 });

// Text index for full-text search
productSchema.index({ name: 'text', brand: 'text', category: 'text' });

module.exports = mongoose.model('Product', productSchema);

