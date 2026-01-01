/**
 * Victory Scraper
 * Scrapes product data from Victory using government API and website
 */

const axios = require('axios');
const IsraeliPriceAPIScraper = require('./israeliPriceAPI');

class VictoryScraper extends IsraeliPriceAPIScraper {
  constructor() {
    super('Victory', '7290027600010'); // Victory store code in government system
    this.websiteBase = 'https://www.victory.co.il';
  }

  /**
   * Search product by barcode
   * Tries government API first, then falls back to website
   */
  async searchByBarcode(barcode) {
    // First try government API
    const govResult = await super.searchByBarcode(barcode);
    if (govResult) return govResult;

    // Fallback to Victory website
    try {
      const searchUrl = `${this.websiteBase}/api/products/search`;
      
      const response = await axios.get(searchUrl, {
        params: { barcode },
        headers: this.headers,
        timeout: 10000,
      });

      if (response.data && response.data.product) {
        return this.parseProduct(response.data.product);
      }

      return null;
    } catch (error) {
      console.error(`Victory website search error: ${error.message}`);
      return null;
    }
  }

  /**
   * Search products by name
   */
  async searchByName(query) {
    // First try government API
    const govResults = await super.searchByName(query);
    if (govResults && govResults.length > 0) return govResults;

    // Fallback to website
    try {
      const searchUrl = `${this.websiteBase}/api/products/search`;
      
      const response = await axios.get(searchUrl, {
        params: { q: encodeURIComponent(query) },
        headers: this.headers,
        timeout: 10000,
      });

      if (response.data && response.data.products) {
        return response.data.products.map(p => this.parseProduct(p));
      }

      return [];
    } catch (error) {
      console.error(`Victory website name search error: ${error.message}`);
      return [];
    }
  }
}

module.exports = VictoryScraper;

