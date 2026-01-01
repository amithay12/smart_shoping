/**
 * Israeli Government Price Transparency API
 * Uses the official Consumer Protection Authority API
 * All Israeli supermarkets are required to publish prices daily
 */

const axios = require('axios');
const BaseScraper = require('./baseScraper');
const governmentPriceService = require('./governmentPriceService');

class IsraeliPriceAPIScraper extends BaseScraper {
  constructor(storeName, storeCode) {
    super(storeName, 'https://prices.shufersal.co.il');
    this.storeCode = storeCode; // Store code in government system
    this.apiBase = 'https://prices.shufersal.co.il'; // Government price transparency API
  }

  /**
   * Search product by barcode using government API
   */
  async searchByBarcode(barcode) {
    try {
      // Use government price service to search across all stores
      const results = await governmentPriceService.searchByBarcode(barcode);
      
      // Find result for this specific store
      const storeResult = results.find(r => r.store === this.storeName);
      
      if (storeResult && storeResult.product) {
        return this.parseProduct(storeResult.product);
      }

      // Fallback: Try to get price file and parse it
      return await this.searchInPriceFile(barcode);
    } catch (error) {
      console.error(`${this.storeName} barcode search error:`, error.message);
      return null;
    }
  }

  /**
   * Search in the daily price file
   */
  async searchInPriceFile(barcode) {
    try {
      // Get today's price file using government service
      const priceFile = await governmentPriceService.getTodayPriceFile(this.storeName);
      
      if (!priceFile) return null;

      // Extract products based on file type
      let products = [];
      if (priceFile.type === 'xml') {
        // Parse XML
        const xml2js = require('xml2js');
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(priceFile.data);
        products = this.extractProductsFromXML(result);
      } else if (priceFile.type === 'csv') {
        products = priceFile.products || [];
      } else {
        // JSON format
        products = priceFile.products || priceFile.Items || priceFile.data?.products || [];
      }

      // Find product by barcode
      const product = products.find(p => 
        p.barcode === barcode || 
        p.EAN === barcode || 
        p.ItemCode === barcode ||
        p.Barcode === barcode
      );

      if (product) {
        return this.parseProduct(product);
      }

      return null;
    } catch (error) {
      console.error(`Error searching price file: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract products from XML structure
   */
  extractProductsFromXML(xmlData) {
    // This depends on the actual XML structure
    // Common structure: Root -> Items -> Item[]
    try {
      const items = xmlData.Root?.Items?.Item || 
                   xmlData.Items?.Item || 
                   xmlData.Products?.Product || [];
      
      return Array.isArray(items) ? items : [items];
    } catch (error) {
      return [];
    }
  }

  /**
   * Search products by name
   */
  async searchByName(query) {
    try {
      // Get price file and search in it
      const priceFile = await governmentPriceService.getTodayPriceFile(this.storeName);
      
      if (!priceFile) return [];

      let products = [];
      if (priceFile.type === 'xml') {
        const xml2js = require('xml2js');
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(priceFile.data);
        products = this.extractProductsFromXML(result);
      } else if (priceFile.type === 'csv') {
        products = priceFile.products || [];
      } else {
        products = priceFile.products || priceFile.Items || priceFile.data?.products || [];
      }

      // Filter products by name
      const queryLower = query.toLowerCase();
      const matching = products.filter(p => {
        const name = (p.name || p.ItemName || p.ProductName || '').toLowerCase();
        return name.includes(queryLower);
      });

      return matching.map(p => this.parseProduct(p)).slice(0, 20); // Limit to 20 results
    } catch (error) {
      console.error(`${this.storeName} name search error:`, error.message);
      return [];
    }
  }

  /**
   * Parse product data from API response
   */
  parseProduct(productData) {
    // Handle different response formats
    const price = this.normalizePrice(
      productData.price || 
      productData.Price || 
      productData.ItemPrice || 
      productData.finalPrice ||
      productData.FinalPrice
    );

    const originalPrice = this.normalizePrice(
      productData.originalPrice || 
      productData.OriginalPrice || 
      productData.ItemOriginalPrice
    );

    return {
      name: productData.name || productData.ItemName || productData.ProductName || productData.Description,
      barcode: productData.barcode || productData.EAN || productData.ItemCode || productData.Barcode,
      price: price,
      originalPrice: originalPrice,
      imageUrl: productData.imageUrl || productData.ImageUrl || productData.image,
      unit: productData.unit || productData.Unit || productData.UnitOfMeasure,
      size: productData.size || productData.Size || productData.Quantity,
      brand: productData.brand || productData.Brand || productData.Manufacturer,
      category: productData.category || productData.Category || productData.CategoryName,
      inStock: productData.inStock !== false && productData.InStock !== false,
      discount: productData.discount || productData.Discount,
      store: this.storeName,
      productUrl: productData.url || productData.Url,
    };
  }

  /**
   * Get store locations from government data
   */
  async getStoreLocations() {
    try {
      // For now, return empty array - store locations need to be fetched from actual websites
      // This will be implemented by each specific scraper
      return [];
    } catch (error) {
      console.error(`${this.storeName} stores error:`, error.message);
      return [];
    }
  }
}

module.exports = IsraeliPriceAPIScraper;

