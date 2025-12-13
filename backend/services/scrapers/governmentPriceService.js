/**
 * Israeli Government Price Transparency Service
 * 
 * Since 2015, Israeli retailers must publish prices daily.
 * This service accesses the official Consumer Protection Authority data.
 * 
 * Documentation: https://www.gov.il/he/departments/legalInfo/cpfta_prices_regulations
 */

const axios = require('axios');
const https = require('https');

class GovernmentPriceService {
  constructor() {
    // Base URL for government price transparency system
    this.baseUrl = 'https://prices.shufersal.co.il';
    this.apiUrl = 'https://prices.shufersal.co.il/FileObject/GetFile';
    
    // Store codes in government system
    this.storeCodes = {
      'Shufersal': '7290027600007',
      'Rami Levy': '7290027600008',
      'Yohananof': '7290027600009',
      'Victory': '7290027600010',
    };

    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/json, text/xml, */*',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
    };
  }

  /**
   * Get today's price file for a store
   * @param {string} storeName - Store name
   * @returns {Promise<Object>} Price file data
   */
  async getTodayPriceFile(storeName) {
    try {
      const storeCode = this.storeCodes[storeName];
      if (!storeCode) {
        throw new Error(`Unknown store: ${storeName}`);
      }

      // Format: YYYYMMDD
      const today = new Date();
      const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
      
      // Try different file ID formats
      const fileIds = [
        `${storeCode}_${dateStr}`,
        `${storeCode}-${dateStr}`,
        `Store${storeCode}_${dateStr}`,
      ];

      for (const fileId of fileIds) {
        try {
          const url = `${this.apiUrl}?fileId=${fileId}`;
          const response = await axios.get(url, {
            headers: this.headers,
            timeout: 15000,
            responseType: 'text',
            // Allow self-signed certificates if needed
            httpsAgent: new https.Agent({
              rejectUnauthorized: false,
            }),
          });

          if (response.data) {
            return this.parsePriceFile(response.data);
          }
        } catch (error) {
          // Try next format
          continue;
        }
      }

      // If today's file not found, try yesterday
      return await this.getPriceFile(storeName, new Date(Date.now() - 86400000));
    } catch (error) {
      console.error(`Error getting price file for ${storeName}:`, error.message);
      return null;
    }
  }

  /**
   * Get price file for a specific date
   */
  async getPriceFile(storeName, date) {
    const storeCode = this.storeCodes[storeName];
    const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    
    const fileId = `${storeCode}_${dateStr}`;
    const url = `${this.apiUrl}?fileId=${fileId}`;

    try {
      const response = await axios.get(url, {
        headers: this.headers,
        timeout: 15000,
        responseType: 'text',
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });

      return this.parsePriceFile(response.data);
    } catch (error) {
      console.error(`Error getting price file: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse price file (XML or JSON)
   */
  parsePriceFile(fileData) {
    try {
      // Try JSON first
      if (fileData.trim().startsWith('{') || fileData.trim().startsWith('[')) {
        return JSON.parse(fileData);
      }

      // Try XML
      if (fileData.includes('<?xml') || fileData.includes('<')) {
        // For now, return raw XML - will be parsed by xml2js in scraper
        return { type: 'xml', data: fileData };
      }

      // Try CSV
      if (fileData.includes(',')) {
        return this.parseCSV(fileData);
      }

      return null;
    } catch (error) {
      console.error('Error parsing price file:', error.message);
      return null;
    }
  }

  /**
   * Parse CSV format
   */
  parseCSV(csvData) {
    const lines = csvData.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const products = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = lines[i].split(',').map(v => v.trim());
      const product = {};
      
      headers.forEach((header, index) => {
        product[header] = values[index] || '';
      });
      
      products.push(product);
    }

    return { products, type: 'csv' };
  }

  /**
   * Search product by barcode across all stores
   */
  async searchByBarcode(barcode) {
    const results = [];

    for (const storeName of Object.keys(this.storeCodes)) {
      try {
        const priceFile = await this.getTodayPriceFile(storeName);
        if (!priceFile) continue;

        const products = priceFile.products || priceFile.Items || priceFile.data?.products || [];
        const product = products.find(p => 
          p.barcode === barcode || 
          p.EAN === barcode || 
          p.ItemCode === barcode ||
          p.Barcode === barcode
        );

        if (product) {
          results.push({
            store: storeName,
            product: this.normalizeProduct(product),
          });
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Error searching ${storeName}:`, error.message);
      }
    }

    return results;
  }

  /**
   * Normalize product data from different formats
   */
  normalizeProduct(product) {
    return {
      name: product.name || product.ItemName || product.ProductName || product.Description,
      barcode: product.barcode || product.EAN || product.ItemCode || product.Barcode,
      price: this.normalizePrice(product.price || product.Price || product.ItemPrice || product.FinalPrice),
      originalPrice: this.normalizePrice(product.originalPrice || product.OriginalPrice || product.ItemOriginalPrice),
      unit: product.unit || product.Unit || product.UnitOfMeasure,
      size: product.size || product.Size || product.Quantity,
      brand: product.brand || product.Brand || product.Manufacturer,
      category: product.category || product.Category || product.CategoryName,
    };
  }

  /**
   * Normalize price string to number
   */
  normalizePrice(priceStr) {
    if (!priceStr) return null;
    const cleaned = String(priceStr)
      .replace(/₪/g, '')
      .replace(/ILS/g, '')
      .replace(/NIS/g, '')
      .replace(/,/g, '')
      .replace(/\s/g, '')
      .trim();
    const price = parseFloat(cleaned);
    return isNaN(price) ? null : price;
  }
}

module.exports = new GovernmentPriceService();

