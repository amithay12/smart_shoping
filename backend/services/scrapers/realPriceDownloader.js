/**
 * Real Price Downloader
 * Downloads and parses price files from Israeli supermarkets
 * Handles Shufersal, Rami Levy, and Yohananof
 */

const axios = require('axios');
const https = require('https');
const cheerio = require('cheerio');
const zlib = require('zlib');
const xml2js = require('xml2js');

class RealPriceDownloader {
  constructor() {
    this.supermarkets = {
      'Shufersal': {
        baseUrl: 'https://prices.shufersal.co.il',
        filePattern: 'PriceFull7290027600007-{DATE}-001',
        storeCode: '7290027600007',
      },
      'Rami Levy': {
        baseUrl: 'https://url.publishedprices.co.il',
        loginUrl: 'https://url.publishedprices.co.il/file',
        username: 'RamiLevi',
        password: '',
        storeCode: '7290058140886',
      },
      'Yohananof': {
        baseUrl: 'https://url.publishedprices.co.il',
        loginUrl: 'https://url.publishedprices.co.il/file',
        username: 'yohananof',
        password: '',
        storeCode: '7290803800003',
      },
    };
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'application/xml, text/xml, */*',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
    };
    this.cookies = {};
  }

  /**
   * Get date string in format YYYYMMDD
   */
  getDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Authenticate with publishedprices.co.il (for Rami Levy and Yohananof)
   */
  async authenticate(supermarketName) {
    const config = this.supermarkets[supermarketName];
    if (!config.loginUrl) {
      return true; // No authentication needed
    }

    try {
      const httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });

      const response = await axios.post(
        config.loginUrl,
        new URLSearchParams({
          username: config.username,
          password: config.password,
        }),
        {
          headers: {
            ...this.headers,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          httpsAgent: httpsAgent,
          maxRedirects: 5,
          validateStatus: (status) => status < 500,
        }
      );

      if (response.headers['set-cookie']) {
        this.cookies[supermarketName] = response.headers['set-cookie'].join('; ');
      }

      return response.status === 200 || response.status === 302;
    } catch (error) {
      console.error(`  ❌ Authentication failed for ${supermarketName}:`, error.message);
      return false;
    }
  }

  /**
   * Download Shufersal price file
   */
  async downloadShufersalFile() {
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });

    try {
      const response = await axios.get('https://prices.shufersal.co.il/', {
        headers: this.headers,
        httpsAgent: httpsAgent,
        timeout: 30000,
      });

      const $ = cheerio.load(response.data);
      const downloadLinks = [];

      $('a[href*="blob.core.windows.net"]').each((i, elem) => {
        const href = $(elem).attr('href');
        if (href && href.includes('.gz') && href.includes('Price7290027600007')) {
          const fullUrl = href.startsWith('http') ? href : `https://pricesprodpublic.blob.core.windows.net${href}`;
          downloadLinks.push(fullUrl);
        }
      });

      $('table tr, table td').each((i, elem) => {
        const link = $(elem).find('a[href*="blob"]').attr('href');
        if (link && link.includes('.gz') && link.includes('Price7290027600007')) {
          const fullUrl = link.startsWith('http') ? link : `https://pricesprodpublic.blob.core.windows.net${link}`;
          downloadLinks.push(fullUrl);
        }
      });

      const uniqueLinks = [...new Set(downloadLinks)];
      if (uniqueLinks.length === 0) {
        return null;
      }

      const sortedLinks = uniqueLinks.sort((a, b) => {
        const storeA = parseInt(a.match(/Price7290027600007-(\d+)-/)?.[1] || '0');
        const storeB = parseInt(b.match(/Price7290027600007-(\d+)-/)?.[1] || '0');
        return storeB - storeA;
      });

      for (const link of sortedLinks.slice(0, 5)) {
        try {
          const fileResponse = await axios.get(link, {
            headers: {
              ...this.headers,
              'Accept-Encoding': 'gzip, deflate, br',
            },
            timeout: 60000,
            responseType: 'arraybuffer',
            maxContentLength: 500 * 1024 * 1024,
            httpsAgent: httpsAgent,
            maxRedirects: 5,
          });

          if (fileResponse.data && fileResponse.data.length > 1000) {
            return Buffer.from(fileResponse.data);
          }
        } catch (error) {
          continue;
        }
      }

      return null;
    } catch (error) {
      console.error(`  ❌ Error downloading Shufersal file:`, error.message);
      return null;
    }
  }

  /**
   * Download file from publishedprices.co.il (Rami Levy and Yohananof)
   */
  async downloadPublishedPricesFile(supermarketName) {
    const config = this.supermarkets[supermarketName];
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });
    
    const authenticated = await this.authenticate(supermarketName);
    if (!authenticated) {
      return null;
    }

    try {
      const puppeteer = require('puppeteer');
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      
      const page = await browser.newPage();
      
      if (this.cookies[supermarketName]) {
        const cookieString = this.cookies[supermarketName];
        const cookies = cookieString.split(';').map(c => {
          const [name, value] = c.trim().split('=');
          return { name, value, domain: 'url.publishedprices.co.il', path: '/' };
        }).filter(c => c.name && c.value);
        await page.setCookie(...cookies);
      }
      
      await page.goto(config.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForTimeout(3000);
      await page.waitForSelector('table, .file-list, [class*="file"], [id*="file"]', { timeout: 10000 }).catch(() => {});
      
      const fileNames = await page.evaluate((storeCode) => {
        const files = [];
        
        const rows = document.querySelectorAll('table tr, tbody tr, .file-row');
        rows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length > 0) {
            const fileName = cells[0].textContent.trim();
            if (fileName && (fileName.includes('NULLPrice') || fileName.includes('Price')) && fileName.includes('.gz')) {
              files.push(fileName);
            }
          }
        });
        
        const allText = document.body.innerText;
        const fileMatches = allText.match(/NULLPrice[\d-]+\.gz/g);
        if (fileMatches) {
          fileMatches.forEach(file => {
            if (file.includes(storeCode) && !files.includes(file)) {
              files.push(file);
            }
          });
        }
        
        const links = document.querySelectorAll('a[href*=".gz"]');
        links.forEach(link => {
          const href = link.getAttribute('href') || link.textContent;
          if (href && href.includes('NULLPrice') && href.includes(storeCode) && href.includes('.gz')) {
            const fileName = href.split('/').pop() || href;
            if (!files.includes(fileName)) {
              files.push(fileName);
            }
          }
        });
        
        return files;
      }, config.storeCode);
      
      await browser.close();
      
      if (fileNames.length === 0) {
        return null;
      }
      
      for (const fileName of fileNames.slice(0, 5)) {
        const downloadUrls = [
          `${config.baseUrl}/file/${fileName}`,
          `${config.baseUrl}/file/download/${fileName}`,
          `${config.baseUrl}/download/${fileName}`,
          `${config.baseUrl}/${fileName}`,
          `${config.baseUrl}/file?file=${encodeURIComponent(fileName)}`,
        ];
        
        for (const url of downloadUrls) {
          try {
            const fileResponse = await axios.get(url, {
              headers: {
                ...this.headers,
                Cookie: this.cookies[supermarketName] || '',
              },
              httpsAgent: httpsAgent,
              timeout: 60000,
              responseType: 'arraybuffer',
              maxContentLength: 500 * 1024 * 1024,
              maxRedirects: 5,
            });

            if (fileResponse.data && fileResponse.data.length > 1000) {
              return Buffer.from(fileResponse.data);
            }
          } catch (error) {
            continue;
          }
        }
      }
      
      return null;
    } catch (error) {
      return await this.downloadPublishedPricesFileFallback(supermarketName);
    }
  }

  /**
   * Fallback method without Puppeteer
   */
  async downloadPublishedPricesFileFallback(supermarketName) {
    const config = this.supermarkets[supermarketName];
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    
    const today = new Date();
    const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
    const timesToTry = ['1900', '0200', '1700', '1800', '2000'];
    
    for (const timeStr of timesToTry) {
      for (let fileNum = 1; fileNum <= 20; fileNum++) {
        const fileNumStr = String(fileNum).padStart(3, '0');
        const fileName = `NULLPrice${config.storeCode}-${fileNumStr}-${dateStr}${timeStr}.gz`;
        
        const downloadUrls = [
          `${config.baseUrl}/file/${fileName}`,
          `${config.baseUrl}/file/download/${fileName}`,
          `${config.baseUrl}/download/${fileName}`,
        ];
        
        for (const url of downloadUrls) {
          try {
            const fileResponse = await axios.get(url, {
              headers: {
                ...this.headers,
                Cookie: this.cookies[supermarketName] || '',
              },
              httpsAgent: httpsAgent,
              timeout: 30000,
              responseType: 'arraybuffer',
              maxContentLength: 500 * 1024 * 1024,
            });

            if (fileResponse.data && fileResponse.data.length > 1000) {
              return Buffer.from(fileResponse.data);
            }
          } catch (error) {
            continue;
          }
        }
      }
    }
    
    return null;
  }

  /**
   * Try to download price file from a supermarket
   */
  async downloadPriceFile(supermarketName, date = new Date()) {
    const config = this.supermarkets[supermarketName];
    if (!config) {
      throw new Error(`Unknown supermarket: ${supermarketName}`);
    }

    if (supermarketName === 'Shufersal') {
      return await this.downloadShufersalFile();
    }

    if (supermarketName === 'Rami Levy' || supermarketName === 'Yohananof') {
      return await this.downloadPublishedPricesFile(supermarketName);
    }

    return null;
  }

  /**
   * Decompress GZ file
   */
  decompressGZ(data) {
    try {
      return zlib.gunzipSync(data);
    } catch (error) {
      throw new Error(`Failed to decompress GZ: ${error.message}`);
    }
  }

  /**
   * Parse XML file
   */
  async parseXML(xmlData) {
    try {
      const parser = new xml2js.Parser({
        explicitArray: false,
        mergeAttrs: true,
        trim: true,
        ignoreAttrs: false,
        explicitRoot: true,
        explicitCharkey: false,
        charkey: '_',
        attrkey: '$',
        // More lenient parsing
        emptyTag: '',
        normalize: true,
        normalizeTags: false,
        // Handle malformed XML
        async: false,
        strict: false,
      });

      const xmlString = Buffer.isBuffer(xmlData) ? xmlData.toString('utf-8') : xmlData;
      
      // Try to fix common XML issues
      let cleanedXml = xmlString
        .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
        .replace(/&(?![a-zA-Z0-9#]+;)/g, '&amp;'); // Fix unescaped ampersands
      
      const parsed = await parser.parseStringPromise(cleanedXml);
      return parsed;
    } catch (error) {
      // Log first 500 chars of XML for debugging
      const xmlString = Buffer.isBuffer(xmlData) ? xmlData.toString('utf-8') : xmlData;
      console.error(`  XML preview (first 500 chars): ${xmlString.substring(0, 500)}`);
      throw new Error(`Failed to parse XML: ${error.message}`);
    }
  }

  /**
   * Extract products from parsed XML (handles different formats)
   */
  extractProducts(xmlData, supermarketName) {
    try {
      let items = [];

      if (xmlData.root && xmlData.root.Items) {
        if (xmlData.root.Items.Item) {
          items = Array.isArray(xmlData.root.Items.Item) ? xmlData.root.Items.Item : [xmlData.root.Items.Item];
        } else if (xmlData.root.Items['$'] && xmlData.root.Items['$'].Count === '0') {
          items = [];
        }
      } else if (xmlData.Root && xmlData.Root.Items) {
        if (xmlData.Root.Items.Item) {
          items = Array.isArray(xmlData.Root.Items.Item) ? xmlData.Root.Items.Item : [xmlData.Root.Items.Item];
        } else if (xmlData.Root.Items['$'] && xmlData.Root.Items['$'].Count === '0') {
          items = [];
        }
      } else if (xmlData.Items) {
        items = xmlData.Items.Item || [];
      } else if (xmlData.Products) {
        items = xmlData.Products.Product || [];
      } else if (xmlData.Item) {
        items = [xmlData.Item];
      } else if (xmlData.Product) {
        items = [xmlData.Product];
      }

      if (!Array.isArray(items)) {
        items = [items];
      }

      items = items.filter(Boolean);
      return items.map(item => this.normalizeProduct(item, supermarketName)).filter(Boolean);
    } catch (error) {
      console.error(`Error extracting products: ${error.message}`);
      return [];
    }
  }

  /**
   * Normalize product data from XML
   */
  normalizeProduct(item, supermarketName) {
    const getValue = (obj, ...keys) => {
      for (const key of keys) {
        if (obj && obj[key] !== undefined && obj[key] !== null && obj[key] !== '') {
          const value = String(obj[key]).trim();
          if (value) return value;
        }
        if (obj && obj['$'] && obj['$'][key] !== undefined) {
          const value = String(obj['$'][key]).trim();
          if (value) return value;
        }
      }
      return '';
    };

    const price = this.normalizePrice(
      getValue(item, 'ItemPrice', 'Price', 'FinalPrice', 'price', 'ItemPrice', 'PriceValue', 'PriceUpdate')
    );

    const barcode = getValue(item, 'ItemCode', 'EAN', 'Barcode', 'barcode', 'ItemCode', 'BarcodeValue', 'Code');
    const name = getValue(item, 'ItemName', 'ProductName', 'Description', 'name', 'ItemName', 'ProductName', 'Name');

    if (!barcode || !name) {
      return null;
    }

    let finalPrice = price;
    if (!finalPrice) {
      finalPrice = this.normalizePrice(
        getValue(item, 'UnitPrice', 'PricePerUnit', 'UnitPriceValue')
      );
    }

    return {
      barcode: barcode,
      name: name,
      price: finalPrice,
      brand: getValue(item, 'ManufacturerName', 'Brand', 'brand', 'Manufacturer', 'ManufacturerName'),
      category: getValue(item, 'CategoryName', 'Category', 'category', 'Category', 'CategoryName'),
      unit: getValue(item, 'UnitOfMeasure', 'Unit', 'unit', 'UnitOfMeasure', 'Unit', 'QuantityUnit'),
      size: getValue(item, 'Quantity', 'Size', 'size', 'Quantity', 'QuantityValue', 'UnitQty'),
      supermarket: supermarketName,
    };
  }

  /**
   * Normalize price string to number
   */
  normalizePrice(priceStr) {
    if (!priceStr) return null;
    const price = parseFloat(String(priceStr).replace(/[^\d.]/g, ''));
    return isNaN(price) || price <= 0 ? null : price;
  }

  /**
   * Download and parse multiple files to get a good amount of products
   */
  async downloadAndParse(supermarketName, maxProducts = 500) {
    const products = [];
    const seenBarcodes = new Set();
    
    try {
      // Download first file
      let fileData = await this.downloadPriceFile(supermarketName);
      
      if (!fileData) {
        return [];
      }

      // Parse first file
      let xmlData;
      try {
        xmlData = this.decompressGZ(fileData);
      } catch (error) {
        xmlData = fileData;
      }

      const parsed = await this.parseXML(xmlData);
      const fileProducts = this.extractProducts(parsed, supermarketName);

      // Add products up to maxProducts
      for (const product of fileProducts) {
        if (products.length >= maxProducts) break;
        if (product.barcode && !seenBarcodes.has(product.barcode)) {
          products.push(product);
          seenBarcodes.add(product.barcode);
        }
      }

      // If we need more products, try downloading more files (especially for Yohananof)
      if (products.length < maxProducts && (supermarketName === 'Yohananof' || supermarketName === 'Rami Levy')) {
        for (let i = 0; i < 3 && products.length < maxProducts; i++) {
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          fileData = await this.downloadPriceFile(supermarketName);
          if (!fileData) break;

          try {
            xmlData = this.decompressGZ(fileData);
          } catch (error) {
            xmlData = fileData;
          }

          const parsed2 = await this.parseXML(xmlData);
          const fileProducts2 = this.extractProducts(parsed2, supermarketName);

          for (const product of fileProducts2) {
            if (products.length >= maxProducts) break;
            if (product.barcode && !seenBarcodes.has(product.barcode)) {
              products.push(product);
              seenBarcodes.add(product.barcode);
            }
          }
        }
      }

      return products;
    } catch (error) {
      console.error(`Error in downloadAndParse for ${supermarketName}:`, error.message);
      return products;
    }
  }

  /**
   * Download all supermarkets
   */
  async downloadAll(maxProducts = 500) {
    const results = {};
    
    for (const supermarketName of ['Shufersal', 'Rami Levy', 'Yohananof']) {
      try {
        console.log(`\n📥 Downloading prices for ${supermarketName}...`);
        const products = await this.downloadAndParse(supermarketName, maxProducts);
        results[supermarketName] = products;
        console.log(`✅ Extracted ${products.length} valid products`);
      } catch (error) {
        console.error(`❌ Error downloading ${supermarketName}:`, error.message);
        results[supermarketName] = [];
      }
    }
    
    return results;
  }
}

module.exports = new RealPriceDownloader();
