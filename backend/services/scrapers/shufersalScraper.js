/**
 * Shufersal Scraper
 * Scrapes product data from Shufersal website
 * Website: https://www.shufersal.co.il
 */

const axios = require('axios');
const cheerio = require('cheerio');
const IsraeliPriceAPIScraper = require('./israeliPriceAPI');

class ShufersalScraper extends IsraeliPriceAPIScraper {
  constructor() {
    super('Shufersal', '7290027600007'); // Shufersal store code in government system
    this.websiteBase = 'https://www.shufersal.co.il';
    this.onlineBase = 'https://www.shufersal.co.il/online';
  }

  /**
   * Search product by barcode
   * Tries government API first, then falls back to website
   */
  async searchByBarcode(barcode) {
    // First try government API
    const govResult = await super.searchByBarcode(barcode);
    if (govResult) return govResult;

    // Fallback to Shufersal website
    try {
      // Shufersal online search endpoint
      const searchUrl = `${this.onlineBase}/v/online/search`;
      
      const response = await axios.get(searchUrl, {
        params: { q: barcode },
        headers: this.headers,
        timeout: 10000,
      });

      if (response.data && response.data.products && response.data.products.length > 0) {
        const product = response.data.products[0];
        return this.parseProduct(product);
      }

      return null;
    } catch (error) {
      console.error(`Shufersal website search error: ${error.message}`);
      return null;
    }
  }

  /**
   * Search products by name
   * Tries government API first, then falls back to website
   */
  async searchByName(query) {
    // First try government API
    const govResults = await super.searchByName(query);
    if (govResults && govResults.length > 0) return govResults;

    // Fallback to Shufersal website
    try {
      const searchUrl = `${this.onlineBase}/v/online/search`;
      
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
      console.error(`Shufersal website name search error: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse product data from Shufersal API response
   */
  parseProduct(productData) {
    return {
      name: productData.name || productData.productName,
      barcode: productData.barcode || productData.ean || productData.sku,
      price: this.normalizePrice(productData.price || productData.finalPrice),
      originalPrice: this.normalizePrice(productData.originalPrice),
      imageUrl: productData.imageUrl || productData.image,
      unit: productData.unit || productData.unitOfMeasure,
      size: productData.size || productData.quantity,
      brand: productData.brand || productData.manufacturer,
      category: productData.category || productData.categoryName,
      inStock: productData.inStock !== false,
      discount: productData.discount || null,
      store: 'Shufersal',
      productUrl: productData.url || `${this.baseUrl}/online/p/${productData.id}`,
    };
  }

  /**
   * Get store locations
   */
  async getStoreLocations() {
    try {
      // Shufersal stores API endpoint
      const storesUrl = `${this.apiBase}/v/online/stores`;
      
      const response = await axios.get(storesUrl, {
        headers: this.headers,
        timeout: 10000,
      });

      if (response.data && response.data.stores) {
        return response.data.stores.map(store => ({
          name: `שופרסל - ${store.name}`,
          chain: 'Shufersal',
          address: {
            street: store.address?.street,
            city: store.address?.city,
            zipCode: store.address?.zipCode,
            fullAddress: store.address?.fullAddress || store.address,
          },
          location: {
            type: 'Point',
            coordinates: [store.longitude || store.lng, store.latitude || store.lat],
          },
          phone: store.phone,
          hours: store.hours,
        }));
      }

      return [];
    } catch (error) {
      console.error(`Shufersal stores error: ${error.message}`);
      return [];
    }
  }
}

module.exports = ShufersalScraper;

