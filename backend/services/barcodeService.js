const axios = require('axios');
const Product = require('../models/Product');
const scraperManager = require('./scrapers/scraperManager');

/**
 * Barcode Lookup Service
 * Uses Open Food Facts API (free, no API key required)
 * Alternative: UPCitemdb API
 */

const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v0/product';

// Simple in-memory cache for searched products
// Cache structure: Map<query, { products: Array, timestamp: number }>
// Cache expires after 1 hour
const searchCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

/**
 * Clear expired cache entries
 */
function clearExpiredCache() {
  const now = Date.now();
  for (const [key, value] of searchCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      searchCache.delete(key);
    }
  }
}

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
 * Searches ONLY through CHP to get comprehensive product coverage from all stores
 * @param {string} query - Search query
 * @param {number} limit - Maximum results
 * @param {Object} locationOptions - Location options for fetching prices (city, lat, lng)
 * @returns {Promise<Object>} Search results with products array
 */
async function searchProducts(query, limit = 20, locationOptions = {}) {
  try {
    // Clear expired cache entries
    clearExpiredCache();

    // Normalize query for cache key
    const cacheKey = query.toLowerCase().trim();
    
    // Check cache first
    const cachedResult = searchCache.get(cacheKey);
    if (cachedResult && (Date.now() - cachedResult.timestamp) < CACHE_TTL) {
      console.log(`[Cache] Returning cached results for query: ${query}`);
      return {
        success: true,
        products: cachedResult.products.slice(0, limit),
        fromCache: true,
      };
    }

    // Search ONLY through CHP for comprehensive coverage from all stores
    const resultProducts = [];
    const dbBarcodes = new Set();

    try {
      console.log(`[Search] Searching CHP for query: ${query}`);
      const chpScraper = scraperManager.scrapers['CHP'];
      if (chpScraper) {
        const chpResults = await chpScraper.searchByName(query);
        
        if (chpResults && Array.isArray(chpResults)) {
          // Process all CHP results and save to database
          for (const chpProduct of chpResults) {
            // Only process products with barcodes (CHP products without barcodes can't be saved)
            if (!chpProduct.barcode) {
              continue;
            }

            // Skip if we already processed this barcode
            if (dbBarcodes.has(chpProduct.barcode)) {
              continue;
            }

            // Stop if we've reached the limit
            if (resultProducts.length >= limit) {
              break;
            }

            try {
              // Save product to database (upsert - create if doesn't exist, update if exists)
              const savedProduct = await Product.findOneAndUpdate(
                { barcode: chpProduct.barcode },
                {
                  $setOnInsert: {
                    barcode: chpProduct.barcode,
                    name: chpProduct.name || 'Unknown Product',
                    brand: chpProduct.brand || '',
                    category: chpProduct.category || '',
                    imageUrl: chpProduct.imageUrl || '',
                    unit: chpProduct.unit || '',
                    size: chpProduct.size || '',
                    dataSource: 'chp',
                  },
                },
                { upsert: true, new: true }
              );

              // Prepare product object for response
              const productObj = savedProduct.toObject();
              
              // Ensure imageUrl is available (use CHP image if database doesn't have it)
              if (!productObj.imageUrl && chpProduct.imageUrl) {
                productObj.imageUrl = chpProduct.imageUrl;
              }
              // Handle images array if it exists
              if (!productObj.imageUrl && productObj.images && productObj.images.length > 0) {
                productObj.imageUrl = productObj.images[0];
              }

              resultProducts.push(productObj);
              dbBarcodes.add(savedProduct.barcode);
            } catch (error) {
              console.error(`Error saving product from CHP to database: ${error.message}`);
              // Even if save fails, still add to results with CHP data (but won't have _id)
              if (resultProducts.length < limit) {
                const existsInResults = resultProducts.some(
                  p => p.barcode === chpProduct.barcode || 
                  (p.name && chpProduct.name && p.name.toLowerCase() === chpProduct.name.toLowerCase())
                );
                if (!existsInResults) {
                  resultProducts.push({
                    name: chpProduct.name || 'Unknown Product',
                    brand: chpProduct.brand || '',
                    category: chpProduct.category || '',
                    imageUrl: chpProduct.imageUrl || '',
                    unit: chpProduct.unit || '',
                    size: chpProduct.size || '',
                    barcode: chpProduct.barcode,
                    dataSource: 'chp',
                  });
                  dbBarcodes.add(chpProduct.barcode);
                }
              }
            }
          }
        } else {
          console.log(`[Search] CHP returned no results or invalid format for query: ${query}`);
        }
      } else {
        console.error(`[Search] CHP scraper not available`);
      }
    } catch (error) {
      console.error(`[Search] Error searching CHP: ${error.message}`);
      console.error(`[Search] Error stack:`, error.stack);
    }

    // Limit results
    const finalProducts = resultProducts.slice(0, limit);

    // Save to cache
    searchCache.set(cacheKey, {
      products: finalProducts,
      timestamp: Date.now(),
    });

    // Limit cache size (keep only last 100 searches)
    if (searchCache.size > 100) {
      const firstKey = searchCache.keys().next().value;
      searchCache.delete(firstKey);
    }

    return {
      success: true,
      products: finalProducts,
      fromCache: false,
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


