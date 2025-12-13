const axios = require('axios');
const Product = require('../models/Product');

/**
 * Barcode Lookup Service
 * Uses Open Food Facts API (free, no API key required)
 * Alternative: UPCitemdb API
 */

const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v0/product';

/**
 * Lookup product by barcode using Open Food Facts API
 * @param {string} barcode - The barcode (UPC/EAN)
 * @returns {Promise<Object>} Product data
 */
async function lookupBarcode(barcode) {
  try {
    // First check if we already have this product in our database
    let product = await Product.findOne({ barcode });
    if (product) {
      return {
        success: true,
        product: product.toObject(),
        source: 'database',
      };
    }

    // If not in database, lookup from Open Food Facts
    const response = await axios.get(`${OPEN_FOOD_FACTS_API}/${barcode}.json`, {
      timeout: 5000,
    });

    if (response.data.status === 0 || !response.data.product) {
      return {
        success: false,
        message: 'Product not found in Open Food Facts database',
      };
    }

    const productData = response.data.product;

    // Extract and normalize product information
    const normalizedProduct = {
      barcode: barcode,
      name: productData.product_name || productData.product_name_en || 'Unknown Product',
      brand: productData.brands || productData.brand || '',
      category: productData.categories || productData.categories_tags?.[0] || '',
      imageUrl: productData.image_url || productData.image_front_url || '',
      unit: productData.quantity || '',
      size: productData.quantity || '',
      metadata: {
        ingredients: productData.ingredients_text,
        nutrition: productData.nutriments,
        labels: productData.labels_tags,
        packaging: productData.packaging,
      },
      dataSource: 'openfoodfacts',
    };

    // Save to database for future lookups
    try {
      product = await Product.create(normalizedProduct);
      return {
        success: true,
        product: product.toObject(),
        source: 'openfoodfacts',
      };
    } catch (error) {
      // If save fails (e.g., duplicate), return the data anyway
      console.error('Error saving product to database:', error.message);
      return {
        success: true,
        product: normalizedProduct,
        source: 'openfoodfacts',
      };
    }
  } catch (error) {
    console.error('Barcode lookup error:', error.message);
    
    // Try fallback API (UPCitemdb) if Open Food Facts fails
    if (error.code === 'ECONNABORTED' || error.response?.status >= 500) {
      return await lookupBarcodeFallback(barcode);
    }

    return {
      success: false,
      message: error.message || 'Failed to lookup barcode',
    };
  }
}

/**
 * Fallback barcode lookup using UPCitemdb API
 * @param {string} barcode - The barcode
 * @returns {Promise<Object>} Product data
 */
async function lookupBarcodeFallback(barcode) {
  try {
    const response = await axios.get(`https://api.upcitemdb.com/prod/trial/lookup`, {
      params: { upc: barcode },
      timeout: 5000,
    });

    if (response.data.code !== 'OK' || !response.data.items || response.data.items.length === 0) {
      return {
        success: false,
        message: 'Product not found in UPCitemdb database',
      };
    }

    const item = response.data.items[0];
    const normalizedProduct = {
      barcode: barcode,
      name: item.title || item.description || 'Unknown Product',
      brand: item.brand || '',
      category: '',
      imageUrl: item.images?.[0] || '',
      unit: '',
      size: '',
      metadata: {
        description: item.description,
        model: item.model,
        color: item.color,
        size: item.size,
      },
      dataSource: 'upcitemdb',
    };

    // Save to database
    try {
      const product = await Product.create(normalizedProduct);
      return {
        success: true,
        product: product.toObject(),
        source: 'upcitemdb',
      };
    } catch (error) {
      return {
        success: true,
        product: normalizedProduct,
        source: 'upcitemdb',
      };
    }
  } catch (error) {
    return {
      success: false,
      message: 'All barcode lookup services failed',
    };
  }
}

/**
 * Search products by name
 * @param {string} query - Search query
 * @param {number} limit - Maximum results
 * @returns {Promise<Array>} Array of products
 */
async function searchProducts(query, limit = 20) {
  try {
    const products = await Product.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { brand: { $regex: query, $options: 'i' } },
        { category: { $regex: query, $options: 'i' } },
      ],
    })
      .limit(limit)
      .sort({ name: 1 });

    return {
      success: true,
      products: products.map(p => p.toObject()),
    };
  } catch (error) {
    console.error('Product search error:', error);
    return {
      success: false,
      message: error.message,
      products: [],
    };
  }
}

module.exports = {
  lookupBarcode,
  searchProducts,
};

