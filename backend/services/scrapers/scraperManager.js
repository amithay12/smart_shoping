/**
 * Scraper Manager
 * Manages all supermarket scrapers and coordinates price fetching
 */

const ShufersalScraper = require('./shufersalScraper');
const RamiLevyScraper = require('./ramiLevyScraper');
const YohananofScraper = require('./yohananofScraper');
const CHPScraper = require('./chpScraper');
const Store = require('../../models/Store');
const StoreProduct = require('../../models/StoreProduct');
const Product = require('../../models/Product');

class ScraperManager {
  constructor() {
    this.scrapers = {
      'Shufersal': new ShufersalScraper(),
      'Rami Levy': new RamiLevyScraper(),
      'Yohananof': new YohananofScraper(),
      'CHP': new CHPScraper(),
    };
  }

  /**
   * Search for a product across all stores
   * @param {string} barcode - Product barcode
   * @returns {Promise<Array>} Array of products with prices from different stores
   */
  async searchProductAcrossStores(barcode) {
    const results = [];

    for (const [storeName, scraper] of Object.entries(this.scrapers)) {
      try {
        const product = await scraper.searchByBarcode(barcode);
        if (product) {
          results.push({
            ...product,
            storeName,
          });
        }
        // Rate limiting - wait between requests
        await scraper.sleep(1000);
      } catch (error) {
        console.error(`Error searching ${storeName}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Update product prices for a specific product across all stores
   * @param {string} productId - Product ID in database
   * @returns {Promise<Object>} Update summary
   */
  async updateProductPrices(productId) {
    const product = await Product.findById(productId);
    if (!product || !product.barcode) {
      throw new Error('Product not found or missing barcode');
    }

    const results = await this.searchProductAcrossStores(product.barcode);
    const updateSummary = {
      productId,
      productName: product.name,
      storesUpdated: 0,
      pricesUpdated: [],
      errors: [],
    };

    for (const result of results) {
      try {
        // Find or create store
        let store = await Store.findOne({ chain: result.storeName });
        
        if (!store) {
          // Try to get store locations and create store
          const scraper = this.scrapers[result.storeName];
          const locations = await scraper.getStoreLocations();
          
          if (locations.length > 0) {
            // Use first location as main store (or you can create multiple)
            const storeData = locations[0];
            store = await Store.create(storeData);
          } else {
            console.warn(`No store locations found for ${result.storeName}`);
            continue;
          }
        }

        // Update or create StoreProduct
        const storeProduct = await StoreProduct.findOneAndUpdate(
          { product: productId, store: store._id },
          {
            price: result.price,
            currency: 'ILS',
            isAvailable: result.inStock !== false,
            inStock: result.inStock !== false,
            lastPriceUpdate: new Date(),
            $push: {
              priceHistory: {
                price: result.price,
                date: new Date(),
              },
            },
          },
          { upsert: true, new: true }
        );

        updateSummary.storesUpdated++;
        updateSummary.pricesUpdated.push({
          store: result.storeName,
          price: result.price,
        });
      } catch (error) {
        updateSummary.errors.push({
          store: result.storeName,
          error: error.message,
        });
      }
    }

    return updateSummary;
  }

  /**
   * Sync all store locations from scrapers
   * @returns {Promise<Object>} Sync summary
   */
  async syncStoreLocations() {
    const summary = {
      storesCreated: 0,
      storesUpdated: 0,
      errors: [],
    };

    for (const [storeName, scraper] of Object.entries(this.scrapers)) {
      try {
        const locations = await scraper.getStoreLocations();
        
        for (const locationData of locations) {
          const existing = await Store.findOne({
            chain: locationData.chain,
            'address.fullAddress': locationData.address.fullAddress,
          });

          if (existing) {
            // Update existing store
            await Store.findByIdAndUpdate(existing._id, {
              location: locationData.location,
              phone: locationData.phone,
              hours: locationData.hours,
            });
            summary.storesUpdated++;
          } else {
            // Create new store
            await Store.create(locationData);
            summary.storesCreated++;
          }
        }
      } catch (error) {
        summary.errors.push({
          store: storeName,
          error: error.message,
        });
      }
    }

    return summary;
  }

  /**
   * Update prices for all products in shopping list
   * @param {Array} productIds - Array of product IDs
   * @returns {Promise<Object>} Update summary
   */
  async updatePricesForProducts(productIds) {
    const summary = {
      totalProducts: productIds.length,
      updated: 0,
      failed: 0,
      details: [],
    };

    for (const productId of productIds) {
      try {
        const result = await this.updateProductPrices(productId);
        summary.updated++;
        summary.details.push(result);
        
        // Rate limiting between products
        await this.scrapers['Shufersal'].sleep(2000);
      } catch (error) {
        summary.failed++;
        summary.details.push({
          productId,
          error: error.message,
        });
      }
    }

    return summary;
  }
}

module.exports = new ScraperManager();

