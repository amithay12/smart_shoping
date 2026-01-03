/**
 * Daily Price Update Job
 * Updates prices for all products in the database using CHP scraper
 * Runs once per day (configurable)
 */

const Product = require('../models/Product');
const StoreProduct = require('../models/StoreProduct');
const Store = require('../models/Store');
const scraperManager = require('./scrapers/scraperManager');

let updateInterval = null;
let isRunning = false;

/**
 * Update prices for a single product using CHP scraper
 * @param {Object} product - Product document
 * @returns {Promise<Object>} Update result
 */
async function updateProductPrices(product) {
  if (!product.barcode) {
    return {
      productId: product._id,
      productName: product.name,
      success: false,
      error: 'Product has no barcode',
    };
  }

  try {
    const chpScraper = scraperManager.scrapers['CHP'];
    if (!chpScraper) {
      return {
        productId: product._id,
        productName: product.name,
        success: false,
        error: 'CHP scraper not available',
      };
    }

    console.log(`[PriceUpdate] Updating prices for product: ${product.name} (${product.barcode})`);
    
    // Search product by barcode in CHP (without location for online stores)
    const chpResult = await chpScraper.searchByBarcode(product.barcode, {});
    
    if (!chpResult || !chpResult.pricesByStore || chpResult.pricesByStore.length === 0) {
      return {
        productId: product._id,
        productName: product.name,
        success: false,
        error: 'No prices found in CHP',
      };
    }

    const updatedStores = [];
    
    // Save each price from CHP
    for (const priceInfo of chpResult.pricesByStore) {
      const chainName = priceInfo.chain || priceInfo.store;
      if (!chainName) continue;

      // Find or create store by chain name
      let store = await Store.findOne({ chain: chainName });
      if (!store) {
        store = await Store.create({
          name: priceInfo.store || chainName,
          chain: chainName,
          address: { fullAddress: 'Israel' },
          location: { type: 'Point', coordinates: [34.7818, 32.0853] },
          isActive: true,
          storeType: 'online', // Default to online for automated updates
        });
      }

      // Update or create StoreProduct
      if (priceInfo.price) {
        await StoreProduct.findOneAndUpdate(
          { product: product._id, store: store._id },
          {
            price: priceInfo.price,
            currency: priceInfo.currency || 'ILS',
            unitPrice: priceInfo.price,
            isAvailable: true,
            inStock: true,
            lastPriceUpdate: new Date(),
            $push: {
              priceHistory: {
                price: priceInfo.price,
                date: new Date(),
              },
            },
          },
          { upsert: true, new: true }
        );

        updatedStores.push({
          store: chainName,
          price: priceInfo.price,
        });
      }
    }

    return {
      productId: product._id,
      productName: product.name,
      success: true,
      storesUpdated: updatedStores.length,
      stores: updatedStores,
    };
  } catch (error) {
    console.error(`[PriceUpdate] Error updating product ${product._id}: ${error.message}`);
    return {
      productId: product._id,
      productName: product.name,
      success: false,
      error: error.message,
    };
  }
}

/**
 * Update prices for all products in the database
 * @param {Object} options - Update options
 * @param {number} options.batchSize - Number of products to process at once
 * @param {number} options.delayBetweenProducts - Delay in ms between products (rate limiting)
 * @returns {Promise<Object>} Update summary
 */
async function updateAllProductPrices(options = {}) {
  const {
    batchSize = 10,
    delayBetweenProducts = 2000, // 2 seconds between products for rate limiting
  } = options;

  if (isRunning) {
    return {
      success: false,
      message: 'Price update is already running',
    };
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log('[PriceUpdate] Starting daily price update job...');

    // Get all products that have barcodes
    const products = await Product.find({ barcode: { $exists: true, $ne: null, $ne: '' } });
    console.log(`[PriceUpdate] Found ${products.length} products to update`);

    const results = {
      total: products.length,
      successful: 0,
      failed: 0,
      details: [],
    };

    // Process products in batches
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      
      for (const product of batch) {
        const result = await updateProductPrices(product);
        results.details.push(result);
        
        if (result.success) {
          results.successful++;
        } else {
          results.failed++;
        }

        // Rate limiting - wait between products
        if (i + batch.indexOf(product) < products.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayBetweenProducts));
        }
      }

      console.log(`[PriceUpdate] Processed ${Math.min(i + batchSize, products.length)}/${products.length} products`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[PriceUpdate] Price update completed in ${duration}s. Success: ${results.successful}, Failed: ${results.failed}`);

    return {
      success: true,
      ...results,
      duration: `${duration}s`,
    };
  } catch (error) {
    console.error('[PriceUpdate] Error in price update job:', error);
    return {
      success: false,
      error: error.message,
    };
  } finally {
    isRunning = false;
  }
}

/**
 * Start scheduled price updates
 * @param {Object} options - Schedule options
 * @param {number} options.intervalMs - Update interval in milliseconds (default: 24 hours)
 * @param {boolean} options.runImmediately - Run update immediately on start (default: false)
 */
function startScheduledUpdates(options = {}) {
  const {
    intervalMs = 24 * 60 * 60 * 1000, // 24 hours
    runImmediately = false,
  } = options;

  // Clear existing interval if any
  if (updateInterval) {
    clearInterval(updateInterval);
  }

  // Run immediately if requested
  if (runImmediately) {
    console.log('[PriceUpdate] Running initial price update...');
    updateAllProductPrices().catch(error => {
      console.error('[PriceUpdate] Error in initial price update:', error);
    });
  }

  // Schedule periodic updates
  updateInterval = setInterval(() => {
    console.log('[PriceUpdate] Scheduled price update triggered');
    updateAllProductPrices().catch(error => {
      console.error('[PriceUpdate] Error in scheduled price update:', error);
    });
  }, intervalMs);

  console.log(`[PriceUpdate] Scheduled price updates started. Interval: ${intervalMs / (1000 * 60 * 60)} hours`);
}

/**
 * Stop scheduled price updates
 */
function stopScheduledUpdates() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
    console.log('[PriceUpdate] Scheduled price updates stopped');
  }
}

/**
 * Check if price update is currently running
 */
function isUpdateRunning() {
  return isRunning;
}

module.exports = {
  updateAllProductPrices,
  updateProductPrices,
  startScheduledUpdates,
  stopScheduledUpdates,
  isUpdateRunning,
};

