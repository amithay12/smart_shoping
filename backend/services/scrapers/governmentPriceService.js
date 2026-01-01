/**
 * Israeli Government Price Transparency Service
 * 
 * Downloads and parses price files from the official government website:
 * https://www.gov.il/he/pages/cpfta_prices_regulations
 * 
 * Each supermarket publishes daily XML files with all product prices.
 * Files are typically named: PriceFull{StoreCode}-{YYYYMMDD}-{StoreNumber}.xml
 */

const axios = require('axios');
const https = require('https');
const zlib = require('zlib');
const xml2js = require('xml2js');

class GovernmentPriceService {
  constructor() {
    // Store configurations - only Shufersal, Rami Levy, and Yohananof
    this.storeConfigs = {
      'Shufersal': {
        storeCode: '7290027600007',
        // Government file URLs - these are the actual download links
        baseUrl: 'https://prices.shufersal.co.il',
        filePattern: 'PriceFull7290027600007-{DATE}-001.xml',
      },
      'Rami Levy': {
        storeCode: '7290027600008',
        baseUrl: 'https://prices.rami-levy.co.il',
        filePattern: 'PriceFull7290027600008-{DATE}-001.xml',
      },
      'Yohananof': {
        storeCode: '7290027600009',
        baseUrl: 'https://prices.yohananof.co.il',
        filePattern: 'PriceFull7290027600009-{DATE}-001.xml',
      },
    };

    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/xml, text/xml, */*',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
    };

    // Cache for price files (in-memory)
    this.priceFileCache = new Map();
  }

  /**
   * Get today's date string in YYYYMMDD format
   */
  getDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Download price file from government website
   */
  async downloadPriceFile(storeName, date = new Date()) {
    const config = this.storeConfigs[storeName];
    if (!config) {
      throw new Error(`Unknown store: ${storeName}`);
    }

    const dateStr = this.getDateString(date);
    const cacheKey = `${storeName}_${dateStr}`;
    
    // Check cache first
    if (this.priceFileCache.has(cacheKey)) {
      return this.priceFileCache.get(cacheKey);
    }

    // Try different file name patterns
    const filePatterns = [
      `PriceFull${config.storeCode}-${dateStr}-001.xml`,
      `PriceFull${config.storeCode}-${dateStr}.xml`,
      `PriceFull${config.storeCode}-${dateStr}-001.xml.gz`,
      `PriceFull${config.storeCode}-${dateStr}.xml.gz`,
      `PriceFull${config.storeCode}-${dateStr}-001.zip`,
    ];

    // Also try direct paths
    const directPaths = [
      `/FileObject/GetFile?fileId=PriceFull${config.storeCode}-${dateStr}-001.xml`,
      `/FileObject/GetFile?fileId=PriceFull${config.storeCode}-${dateStr}.xml`,
      `/PriceFull${config.storeCode}-${dateStr}-001.xml`,
      `/PriceFull${config.storeCode}-${dateStr}.xml`,
      `/prices/PriceFull${config.storeCode}-${dateStr}-001.xml`,
    ];

    for (const pattern of filePatterns) {
      try {
        const url = `${config.baseUrl}/${pattern}`;
        const result = await this.fetchFile(url);
        if (result) {
          this.priceFileCache.set(cacheKey, result);
          return result;
        }
      } catch (error) {
        continue;
      }
    }

    // Try direct paths
    for (const path of directPaths) {
      try {
        const url = `${config.baseUrl}${path}`;
        const result = await this.fetchFile(url);
        if (result) {
          this.priceFileCache.set(cacheKey, result);
          return result;
        }
      } catch (error) {
        continue;
      }
    }

    // If today's file not found, try yesterday
    if (date.getTime() === new Date().setHours(0, 0, 0, 0)) {
      const yesterday = new Date(date);
      yesterday.setDate(yesterday.getDate() - 1);
      console.log(`Today's file not found for ${storeName}, trying yesterday...`);
      return await this.downloadPriceFile(storeName, yesterday);
    }

    return null;
  }

  /**
   * Fetch file from URL (handles gzip, xml, etc.)
   */
  async fetchFile(url) {
    try {
      const response = await axios.get(url, {
        headers: this.headers,
        timeout: 30000,
        responseType: 'arraybuffer',
        maxContentLength: 200 * 1024 * 1024, // 200MB max
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      });

      if (!response.data || response.data.length === 0) {
        return null;
      }

      let data = Buffer.from(response.data);
      
      // Check if gzipped
      if (data[0] === 0x1f && data[1] === 0x8b) {
        data = zlib.gunzipSync(data);
      }

      const xmlString = data.toString('utf-8');
      
      // Parse XML
      const parser = new xml2js.Parser({
        explicitArray: false,
        mergeAttrs: true,
        trim: true,
      });

      const parsed = await parser.parseStringPromise(xmlString);
      return parsed;
    } catch (error) {
      if (error.response && error.response.status === 404) {
        return null; // File not found
      }
      throw error;
    }
  }

  /**
   * Extract products from parsed XML
   */
  extractProducts(xmlData) {
    try {
      // Common XML structure: Root -> Items -> Item[]
      const items = xmlData?.Root?.Items?.Item || 
                   xmlData?.Items?.Item || 
                   xmlData?.Item || [];
      
      const products = Array.isArray(items) ? items : [items];
      return products.filter(Boolean);
    } catch (error) {
      console.error('Error extracting products:', error.message);
      return [];
    }
  }

  /**
   * Normalize product data from XML
   */
  normalizeProduct(product) {
    // Handle both object and array formats from xml2js
    const getValue = (obj, ...keys) => {
      for (const key of keys) {
        if (obj && obj[key] !== undefined) {
          return String(obj[key]).trim();
        }
      }
      return '';
    };

    const price = this.normalizePrice(
      getValue(product, 'ItemPrice', 'Price', 'FinalPrice', 'price')
    );

    return {
      name: getValue(product, 'ItemName', 'ProductName', 'Description', 'name') || 'Unknown Product',
      barcode: getValue(product, 'ItemCode', 'EAN', 'Barcode', 'barcode') || '',
      price: price,
      unit: getValue(product, 'UnitOfMeasure', 'Unit', 'unit') || '',
      size: getValue(product, 'Quantity', 'Size', 'size') || '',
      brand: getValue(product, 'ManufacturerName', 'Brand', 'brand') || '',
      category: getValue(product, 'CategoryName', 'Category', 'category') || '',
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

  /**
   * Get today's price file for a store
   */
  async getTodayPriceFile(storeName) {
    try {
      const xmlData = await this.downloadPriceFile(storeName);
      if (!xmlData) {
        return null;
      }

      const products = this.extractProducts(xmlData);
      
      return {
        type: 'xml',
        products: products.map(p => this.normalizeProduct(p)),
        raw: xmlData,
      };
    } catch (error) {
      console.error(`Error getting price file for ${storeName}:`, error.message);
      return null;
    }
  }

  /**
   * Search product by barcode across all stores
   */
  async searchByBarcode(barcode) {
    const results = [];

    for (const storeName of Object.keys(this.storeConfigs)) {
      try {
        const priceFile = await this.getTodayPriceFile(storeName);
        if (!priceFile || !priceFile.products) continue;

        const product = priceFile.products.find(p => {
          return p.barcode === barcode || 
                 p.barcode === String(barcode) ||
                 p.barcode.replace(/\D/g, '') === String(barcode).replace(/\D/g, '');
        });

        if (product && product.price) {
          results.push({
            store: storeName,
            product: product,
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
   * Get top products from a store (for seeding database)
   */
  async getTopProducts(storeName, limit = 500) {
    try {
      const priceFile = await this.getTodayPriceFile(storeName);
      if (!priceFile || !priceFile.products) {
        return [];
      }

      // Filter products with valid barcodes and prices
      const validProducts = priceFile.products.filter(p => 
        p.barcode && p.barcode.length >= 8 && p.price && p.price > 0
      );

      // Sort by price (or you could sort by popularity if available)
      // For now, just return first N products
      return validProducts.slice(0, limit);
    } catch (error) {
      console.error(`Error getting top products for ${storeName}:`, error.message);
      return [];
    }
  }
}

module.exports = new GovernmentPriceService();
