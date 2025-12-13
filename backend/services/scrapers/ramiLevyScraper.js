/**
 * Rami Levy Scraper
 * Scrapes product data from Rami Levy website
 * Website: https://www.ramilevy.co.il
 */

const axios = require('axios');
const cheerio = require('cheerio');
const IsraeliPriceAPIScraper = require('./israeliPriceAPI');

class RamiLevyScraper extends IsraeliPriceAPIScraper {
  constructor() {
    super('Rami Levy', '7290027600008'); // Rami Levy store code in government system
    this.websiteBase = 'https://www.ramilevy.co.il';
  }

  /**
   * Search product by barcode
   */
  async searchByBarcode(barcode) {
    try {
      // Rami Levy search endpoint
      const searchUrl = `${this.baseUrl}/api/search?barcode=${barcode}`;
      
      const response = await axios.get(searchUrl, {
        headers: this.headers,
        timeout: 10000,
      });

      if (response.data && response.data.product) {
        return this.parseProduct(response.data.product);
      }

      return null;
    } catch (error) {
      console.error(`Rami Levy barcode search error: ${error.message}`);
      return null;
    }
  }

  /**
   * Search products by name
   */
  async searchByName(query) {
    try {
      const searchUrl = `${this.baseUrl}/api/search?q=${encodeURIComponent(query)}`;
      
      const response = await axios.get(searchUrl, {
        headers: this.headers,
        timeout: 10000,
      });

      if (response.data && response.data.products) {
        return response.data.products.map(p => this.parseProduct(p));
      }

      return [];
    } catch (error) {
      console.error(`Rami Levy name search error: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse product data
   */
  parseProduct(productData) {
    return {
      name: productData.name || productData.productName,
      barcode: productData.barcode || productData.ean,
      price: this.normalizePrice(productData.price || productData.salePrice),
      originalPrice: this.normalizePrice(productData.regularPrice),
      imageUrl: productData.image || productData.imageUrl,
      unit: productData.unit,
      size: productData.size,
      brand: productData.brand,
      category: productData.category,
      inStock: productData.inStock !== false,
      discount: productData.discount,
      store: 'Rami Levy',
      productUrl: productData.url || `${this.baseUrl}/product/${productData.id}`,
    };
  }

  /**
   * Get store locations
   */
  async getStoreLocations() {
    try {
      const storesUrl = `${this.baseUrl}/api/stores`;
      
      const response = await axios.get(storesUrl, {
        headers: this.headers,
        timeout: 10000,
      });

      if (response.data && response.data.stores) {
        return response.data.stores.map(store => ({
          name: `רמי לוי - ${store.name}`,
          chain: 'Rami Levy',
          address: {
            street: store.address,
            city: store.city,
            zipCode: store.zipCode,
            fullAddress: store.fullAddress,
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
      console.error(`Rami Levy stores error: ${error.message}`);
      return [];
    }
  }
}

module.exports = RamiLevyScraper;

