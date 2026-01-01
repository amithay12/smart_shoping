/**
 * Base Scraper Class
 * All supermarket scrapers should extend this
 */

class BaseScraper {
  constructor(storeName, baseUrl) {
    this.storeName = storeName;
    this.baseUrl = baseUrl;
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
    };
  }

  /**
   * Search for a product by barcode
   * @param {string} barcode - Product barcode
   * @returns {Promise<Object>} Product data with price
   */
  async searchByBarcode(barcode) {
    throw new Error('searchByBarcode must be implemented by subclass');
  }

  /**
   * Search for products by name
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of products
   */
  async searchByName(query) {
    throw new Error('searchByName must be implemented by subclass');
  }

  /**
   * Get product details including current price
   * @param {string} productUrl - Product page URL
   * @returns {Promise<Object>} Product details
   */
  async getProductDetails(productUrl) {
    throw new Error('getProductDetails must be implemented by subclass');
  }

  /**
   * Get all store locations
   * @returns {Promise<Array>} Array of store locations
   */
  async getStoreLocations() {
    throw new Error('getStoreLocations must be implemented by subclass');
  }

  /**
   * Normalize price string to number
   * @param {string} priceStr - Price string (e.g., "₪12.90" or "12.90 ₪")
   * @returns {number} Price as number
   */
  normalizePrice(priceStr) {
    if (!priceStr) return null;
    
    // Remove currency symbols and whitespace
    const cleaned = priceStr
      .replace(/₪/g, '')
      .replace(/ILS/g, '')
      .replace(/NIS/g, '')
      .replace(/,/g, '')
      .replace(/\s/g, '')
      .trim();
    
    const price = parseFloat(cleaned);
    return isNaN(price) ? null : price;
  }

  /**
   * Extract barcode from product data
   * @param {Object} productData - Product data from website
   * @returns {string|null} Barcode
   */
  extractBarcode(productData) {
    // Common barcode field names
    const barcodeFields = ['barcode', 'ean', 'upc', 'gtin', 'sku', 'productCode'];
    
    for (const field of barcodeFields) {
      if (productData[field]) {
        return String(productData[field]).trim();
      }
    }
    
    return null;
  }

  /**
   * Sleep/delay function to avoid rate limiting
   * @param {number} ms - Milliseconds to sleep
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = BaseScraper;

