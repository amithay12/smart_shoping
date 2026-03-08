/**
 * CHP Scraper
 * Scrapes product data from chp.co.il (Israeli price comparison website)
 * Website: https://chp.co.il
 */

const axios = require('axios');
const cheerio = require('cheerio');
const BaseScraper = require('./baseScraper');

class CHPScraper extends BaseScraper {
  constructor() {
    super('CHP', 'https://chp.co.il');
    this.apiBase = 'https://chp.co.il';
    this.autocompleteEndpoint = '/autocompletion/product_extended';
    this.compareEndpoint = '/main_page/compare_results';
  }

  /**
   * Extract digits-only from barcode for flexible matching (CHP may use leading zeros or different format)
   */
  _barcodeDigits(barcode) {
    if (!barcode || typeof barcode !== 'string') return '';
    return String(barcode).replace(/\D/g, '');
  }

  /**
   * Check if an autocomplete item's barcode matches our search barcode (exact or digits-only)
   */
  _itemBarcodeMatches(item, barcodeClean, barcodeDigits) {
    if (!item.parts || !item.parts.manufacturer_and_barcode) return false;
    const m = item.parts.manufacturer_and_barcode.match(/ברקוד:\s*(\d+)/);
    if (!m) return false;
    const itemBarcode = m[1];
    const itemDigits = this._barcodeDigits(itemBarcode);
    return itemBarcode === barcodeClean || itemDigits === barcodeDigits || itemDigits.endsWith(barcodeDigits) || barcodeDigits.endsWith(itemDigits);
  }

  /**
   * Call compare_results with raw barcode as product_barcode (CHP supports direct barcode lookup)
   */
  async _getProductDetailsByBarcode(barcodeClean, locationOptions) {
    try {
      console.log(`[CHP] Trying direct barcode compare for barcode: ${barcodeClean}`);
      const result = await Promise.race([
        this.getProductDetails(barcodeClean, barcodeClean, locationOptions),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 12000)),
      ]);
      if (result && result.pricesByStore && result.pricesByStore.length > 0) {
        console.log(`[CHP] Got ${result.pricesByStore.length} stores from direct barcode compare (${barcodeClean})`);
        return result;
      }
      console.log(`[CHP] Direct barcode compare returned ${result && result.pricesByStore ? result.pricesByStore.length : 0} stores for ${barcodeClean}`);
      return result && result.pricesByStore ? result : null;
    } catch (e) {
      console.log(`[CHP] Direct barcode compare failed for ${barcodeClean}: ${e.message}`);
      return null;
    }
  }

  /**
   * Search product by barcode
   * @param {string} barcode - Product barcode
   * @param {Object} locationOptions - Location options for physical store prices
   * @param {string} locationOptions.address - Full address (e.g., "רחוב דיזנגוף 50, תל אביב") - like chp.co.il
   * @param {string} locationOptions.city - City name (e.g., "תל אביב", "ירושלים") - for backwards compatibility
   * @param {string} locationOptions.street - Street name (optional) - for backwards compatibility
   * @param {number} locationOptions.cityId - City ID from CHP (optional)
   * @param {number} locationOptions.streetId - Street ID from CHP (optional)
   * @returns {Promise<Object|null>} Product data with prices from multiple stores
   */
  async searchByBarcode(barcode, locationOptions = {}) {
    try {
      const barcodeClean = (barcode && String(barcode).trim()) || '';
      const barcodeDigits = this._barcodeDigits(barcodeClean);
      const {
        address = '',
        city = '',
        street = '',
        cityId = 0,
        streetId = 0,
      } = locationOptions;
      
      // Use autocomplete API to find product by barcode (fast endpoint)
      // CHP accepts full addresses in shopping_address parameter (like chp.co.il does)
      // Priority: address > city > street
      const shoppingAddress = address || city || street || '';
      
      const response = await axios.get(`${this.apiBase}${this.autocompleteEndpoint}`, {
        params: {
          term: barcodeClean,
          from: 0,
          u: Math.random(),
          shopping_address: shoppingAddress,
          shopping_address_city_id: cityId || 0,
          shopping_address_street_id: streetId || 0,
        },
        headers: this.headers,
        timeout: 5000, // Reduced timeout to 5 seconds
      });

      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        if (barcodeDigits.length >= 8) {
          const direct = await this._getProductDetailsByBarcode(barcodeClean, locationOptions);
          if (direct) return direct;
        }
        return null;
      }

      // Filter out pagination items
      const validItems = response.data.filter(item => 
        item.id !== 'prev' && item.id !== 'next' && item.parts
      );

      if (validItems.length === 0) {
        if (barcodeDigits.length >= 8) {
          const direct = await this._getProductDetailsByBarcode(barcodeClean, locationOptions);
          if (direct) return direct;
        }
        return null;
      }

      // Strategy 1: Exact barcode match (string or digits-only)
      let product = validItems.find(item => this._itemBarcodeMatches(item, barcodeClean, barcodeDigits));

      // Strategy 2: By ID format (store_code_barcode)
      if (!product) {
        product = validItems.find(item => {
          if (!item.id) return false;
          const parts = String(item.id).split('_');
          if (parts.length >= 2) {
            const idBarcode = parts[parts.length - 1];
            return idBarcode === barcodeClean || this._barcodeDigits(idBarcode) === barcodeDigits;
          }
          return false;
        });
      }

      // Strategy 3: Partial barcode match (last 8 digits)
      if (!product && barcodeDigits.length >= 8) {
        const partial = barcodeDigits.slice(-8);
        product = validItems.find(item => {
          if (!item.parts || !item.parts.manufacturer_and_barcode) return false;
          const m = item.parts.manufacturer_and_barcode.match(/ברקוד:\s*(\d+)/);
          if (!m) return false;
          const d = this._barcodeDigits(m[1]);
          return d.endsWith(partial) || d.slice(-8) === partial;
        });
      }

      // Strategy 4: First result has barcode/digits in description
      if (!product && validItems.length > 0) {
        const first = validItems[0];
        if (first.parts && first.parts.manufacturer_and_barcode) {
          const desc = first.parts.manufacturer_and_barcode;
          if (desc.includes(barcodeClean) || (barcodeDigits.length >= 8 && desc.includes(barcodeDigits))) {
            product = first;
          }
        }
      }

      // Strategy 5: Any item whose barcode digits equal or contain our barcode digits
      if (!product && barcodeDigits.length >= 8) {
        product = validItems.find(item => {
          if (!item.parts || !item.parts.manufacturer_and_barcode) return false;
          const m = item.parts.manufacturer_and_barcode.match(/ברקוד:\s*(\d+)/);
          if (!m) return false;
          const d = this._barcodeDigits(m[1]);
          return d === barcodeDigits || d.endsWith(barcodeDigits) || barcodeDigits.endsWith(d);
        });
      }

      // Strategy 6: Single result when search term is all digits
      if (!product && validItems.length === 1 && /^\d+$/.test(barcodeClean)) {
        product = validItems[0];
      }

      // No match on first page - try next autocomplete page (CHP may paginate)
      if (!product && barcodeDigits.length >= 8) {
        const response2 = await axios.get(`${this.apiBase}${this.autocompleteEndpoint}`, {
          params: {
            term: barcodeClean,
            from: 20,
            u: Math.random(),
            shopping_address: shoppingAddress,
            shopping_address_city_id: cityId || 0,
            shopping_address_street_id: streetId || 0,
          },
          headers: this.headers,
          timeout: 5000,
        }).catch(() => ({ data: [] }));
        const validItems2 = Array.isArray(response2.data) ? response2.data.filter(item => item.id !== 'prev' && item.id !== 'next' && item.parts) : [];
        product = validItems2.find(item => this._itemBarcodeMatches(item, barcodeClean, barcodeDigits))
          || validItems2.find(item => {
            if (!item.parts || !item.parts.manufacturer_and_barcode) return false;
            const m = item.parts.manufacturer_and_barcode.match(/ברקוד:\s*(\d+)/);
            return m && this._barcodeDigits(m[1]) === barcodeDigits;
          });
      }

      if (!product || !product.parts) {
        if (barcodeDigits.length >= 8) {
          const direct = await this._getProductDetailsByBarcode(barcodeClean, locationOptions);
          if (direct) return direct;
        }
        return null;
      }

      // Return basic product info immediately (fast response)
      // Don't wait for full price comparison page which is slow
      const basicProduct = this.parseAutocompleteProduct(product);
      
      // If address/city is provided, we need full store details (not just basic price)
      // Always try to get full details when location is provided to get actual store names
      if ((locationOptions.address || locationOptions.city) && product.id && product.id !== 'prev' && product.id !== 'next') {
        console.log(`[CHP] Address/location provided, fetching full product details for physical stores...`);
        try {
          const fullDetails = await Promise.race([
            this.getProductDetails(product.id, barcodeClean, locationOptions),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 12000) // 12 second max wait for location searches
            ),
          ]);
          if (fullDetails && fullDetails.pricesByStore && fullDetails.pricesByStore.length > 0) {
            console.log(`[CHP] Got ${fullDetails.pricesByStore.length} stores from full details`);
            return fullDetails;
          }
          // Autocomplete ID sometimes doesn't return prices - try compare with raw barcode
          if (barcodeDigits.length >= 8) {
            const direct = await this._getProductDetailsByBarcode(barcodeClean, locationOptions);
            if (direct && direct.pricesByStore && direct.pricesByStore.length > 0) return direct;
          }
        } catch (error) {
          console.log(`[CHP] Full details fetch timed out or failed: ${error.message}`);
          if (barcodeDigits.length >= 8) {
            const direct = await this._getProductDetailsByBarcode(barcodeClean, locationOptions);
            if (direct && direct.pricesByStore && direct.pricesByStore.length > 0) return direct;
          }
        }
      }
      
      // If we have price range in autocomplete and no location, use it
      if (basicProduct.price && !locationOptions.address && !locationOptions.city) {
        return {
          ...basicProduct,
          pricesByStore: [{
            store: 'CHP',
            price: basicProduct.price,
            currency: 'ILS',
          }],
        };
      }

      // If no price in autocomplete, try to get full details (but with timeout)
      if (product.id && product.id !== 'prev' && product.id !== 'next') {
        try {
          const fullDetails = await Promise.race([
            this.getProductDetails(product.id, barcodeClean, locationOptions),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 8000) // 8 second max wait
            ),
          ]);
          if (fullDetails && fullDetails.pricesByStore && fullDetails.pricesByStore.length > 0) {
            return fullDetails;
          }
          if (barcodeDigits.length >= 8) {
            const direct = await this._getProductDetailsByBarcode(barcodeClean, locationOptions);
            if (direct) return direct;
          }
          return fullDetails || basicProduct;
        } catch (error) {
          console.log(`[CHP] Full details fetch timed out or failed, using basic info: ${error.message}`);
          if (barcodeDigits.length >= 8) {
            const direct = await this._getProductDetailsByBarcode(barcodeClean, locationOptions);
            if (direct) return direct;
          }
          return basicProduct;
        }
      }

      return basicProduct;
    } catch (error) {
      console.error(`[CHP] Barcode search error: ${error.message}`);
      console.error(`[CHP] Error details:`, {
        code: error.code,
        city: locationOptions.city,
        barcode: barcode.trim(),
      });
      if (error.code === 'ECONNABORTED') {
        console.log(`[CHP] Request timed out for barcode: ${barcode.trim()} with city: ${locationOptions.city || 'none'}`);
      }
      return null;
    }
  }

  /**
   * Search products by name
   * @param {string} query - Search query
   * @returns {Promise<Array>} Array of products
   */
  async searchByName(query) {
    try {
      const response = await axios.get(`${this.apiBase}${this.autocompleteEndpoint}`, {
        params: {
          term: query.trim(),
          from: 0,
          u: Math.random(),
          shopping_address: '',
          shopping_address_city_id: 0,
          shopping_address_street_id: 0,
        },
        headers: this.headers,
        timeout: 10000,
      });

      if (!response.data || !Array.isArray(response.data)) {
        return [];
      }

      // Filter out pagination items (prev/next)
      const products = response.data.filter(item => 
        item.id !== 'prev' && item.id !== 'next' && item.parts
      );

      return products.map(item => this.parseAutocompleteProduct(item)).slice(0, 20);
    } catch (error) {
      console.error(`CHP name search error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get full product details with prices from all stores
   * @param {string} productId - Product ID (format: store_code_barcode)
   * @param {string} barcode - Product barcode
   * @param {Object} locationOptions - Location options for physical store prices
   * @param {string} locationOptions.address - Full address (like chp.co.il)
   * @param {string} locationOptions.city - City name (for backwards compatibility)
   * @param {string} locationOptions.street - Street name (for backwards compatibility)
   * @returns {Promise<Object|null>} Product with prices from multiple stores
   */
  async getProductDetails(productId, barcode, locationOptions = {}) {
    try {
      const {
        address = '',
        city = '',
        street = '',
        cityId = 0,
        streetId = 0,
      } = locationOptions;
      
      // Get price comparison page (this is slower, so we limit timeout)
      // CHP accepts full addresses in shopping_address parameter (like chp.co.il does)
      // Priority: address > city > street
      const shoppingAddress = address || city || street || '';
      
      // When productId is a raw barcode (all digits), CHP may require product_name_or_barcode for lookup
      const isBarcodeParam = /^\d+$/.test(String(productId).trim());
      const response = await axios.get(`${this.apiBase}${this.compareEndpoint}`, {
        params: {
          product_barcode: productId,
          product_name_or_barcode: isBarcodeParam ? String(productId).trim() : '',
          shopping_address: shoppingAddress,
          shopping_address_street_id: streetId || 0,
          shopping_address_city_id: cityId || 0,
          from: 0,
          num_results: 50, // Reduced from 100 to speed up
        },
        headers: this.headers,
        timeout: 8000, // Reduced from 15000 to 8 seconds
      });

      if (!response.data) {
        return null;
      }

      // Check if response is HTML
      const contentType = response.headers['content-type'] || '';
      const isHTML = typeof response.data === 'string' && (
        contentType.includes('text/html') || 
        response.data.trim().startsWith('<!') ||
        response.data.includes('<html')
      );
      
      if (!isHTML) {
        return null;
      }

      // Parse HTML response
      const $ = cheerio.load(response.data);
      
      // Extract product name
      const productNameInput = $('#displayed_product_name_and_contents');
      const productName = productNameInput.length ? productNameInput.val() : '';

      // Extract prices from results table
      const prices = [];
      let resultsTable = $('#results-table');
      
      // Try alternative selectors if primary doesn't work
      if (resultsTable.length === 0) {
        resultsTable = $('table.results-table');
      }
      if (resultsTable.length === 0) {
        resultsTable = $('.results-table');
      }
      
      if (resultsTable.length) {
        const rows = resultsTable.find('tbody tr');
        console.log(`[CHP] Found ${rows.length} rows in results table`);
        
        rows.each((index, row) => {
          const $row = $(row);
          const rowClasses = $row.attr('class') || '';
          
          // Skip rows that are just for mobile display (display_when_narrow)
          if (rowClasses.includes('display_when_narrow')) {
            return;
          }
          
          const tds = $row.find('td');
          
          if (tds.length < 5) {
            console.log(`[CHP] Skipping row with ${tds.length} columns (need at least 5)`);
            return;
          }
          
          const chainName = tds.eq(0).text().trim();
          const storeNameCell = tds.eq(1);
          const storeName = storeNameCell.find('a').length > 0 
            ? storeNameCell.find('a').text().trim() 
            : storeNameCell.text().trim();
          
          console.log(`[CHP] Processing store: ${storeName} (${chainName}), columns: ${tds.length}`);
          
          // Determine table structure based on number of columns
          // When address is provided: רשת, שם החנות, כתובת החנות, מרחק (distance), מבצע, מחיר (6 columns)
          // When no address: רשת, שם החנות, אתר אינטרנט, מבצע, מחיר (5 columns)
          const hasAddress = tds.length >= 6;
          
          let priceText, promotionCell, distance = null;
          
          if (hasAddress) {
            // Table with address: td[0] = chain, td[1] = store name, td[2] = address, td[3] = distance, td[4] = promotion, td[5] = price
            const distanceText = tds.eq(3).text().trim(); // Distance in format "1 ק\"מ" or "0.3 ק\"מ"
            console.log(`[CHP] Distance text for ${storeName}: "${distanceText}" (tds.length: ${tds.length})`);
            
            // Extract distance number (e.g., "1 ק\"מ" -> 1, "0.3 ק\"מ" -> 0.3)
            // Try multiple patterns to match Hebrew distance format
            let distanceMatch = distanceText.match(/(\d+\.?\d*)\s*ק/);
            if (!distanceMatch) {
              // Try with Hebrew quote mark: "ק"מ"
              distanceMatch = distanceText.match(/(\d+\.?\d*)\s*ק["']מ/);
            }
            if (!distanceMatch) {
              // Try just numbers followed by any Hebrew characters
              distanceMatch = distanceText.match(/(\d+\.?\d*)/);
            }
            
            if (distanceMatch) {
              distance = parseFloat(distanceMatch[1]);
              console.log(`[CHP] Parsed distance: ${distance}km for store: ${storeName}`);
            } else {
              console.log(`[CHP] Could not parse distance from: "${distanceText}" for store: ${storeName}`);
            }
            priceText = tds.eq(5).text().trim(); // Price is in 6th column (index 5)
            promotionCell = tds.eq(4); // Promotion is in 5th column (index 4)
          } else {
            // Table without address: td[0] = chain, td[1] = store name, td[2] = website, td[3] = promotion, td[4] = price
            console.log(`[CHP] No address column (tds.length: ${tds.length}) for store: ${storeName}`);
            priceText = tds.eq(4).text().trim(); // Price is in 5th column (index 4)
            promotionCell = tds.eq(3); // Promotion is in 4th column (index 3)
          }
          
          // Try to get price from promotion button if available (discounted price)
          let finalPriceText = priceText;
          const promotionButton = promotionCell.find('button.btn-discount');
          
          if (promotionButton.length) {
            const buttonText = promotionButton.text().trim();
            // Try to extract price from button text (e.g., "13.90 *")
            const buttonPriceMatch = buttonText.match(/(\d+\.?\d*)/);
            if (buttonPriceMatch) {
              finalPriceText = buttonPriceMatch[1];
            } else {
              // Try data-discount-desc
              const discountDesc = promotionButton.attr('data-discount-desc') || '';
              const discountMatch = discountDesc.match(/(\d+\.?\d*)\s*ש"ח/);
              if (discountMatch) {
                finalPriceText = discountMatch[1];
              }
            }
          }
          
          const price = this.normalizePrice(finalPriceText);
          
          // Use store name if available, otherwise use chain name
          const displayName = storeName || chainName;
          
          if (displayName && price !== null) {
            const priceInfo = {
              store: displayName,
              chain: chainName || '', // Include chain name (e.g., "שופרסל", "רמי לוי")
              price: price,
              currency: 'ILS',
            };
            
            // Include distance if available (when address is provided)
            if (distance !== null) {
              priceInfo.distance = distance; // Distance in kilometers
              console.log(`[CHP] Added store with distance: ${storeName} - ${distance}km`);
            } else {
              console.log(`[CHP] Store ${storeName} has no distance (hasAddress: ${hasAddress})`);
            }
            
            prices.push(priceInfo);
          }
        });
        
        console.log(`[CHP] Total prices extracted: ${prices.length}, with distances: ${prices.filter(p => p.distance !== null && p.distance !== undefined).length}`);
      } else {
        console.log(`[CHP] No results table found in HTML response`);
      }

      // Use product name from HTML, don't make another API call
      let productInfo = {
        name: productName || 'Unknown Product',
        barcode: barcode,
        brand: '',
        category: '',
        imageUrl: '',
      };

      // Return aggregated product with prices from all stores
      // Since CHP aggregates prices from multiple stores, we return the cheapest price
      // and store all prices in a special format
      const sortedPrices = prices.sort((a, b) => a.price - b.price);
      const cheapestPrice = sortedPrices.length > 0 ? sortedPrices[0].price : null;
      
      // Limit to top 7 cheapest prices for faster response
      const topPrices = sortedPrices.slice(0, 7);

      return {
        name: productInfo.name,
        barcode: barcode,
        price: cheapestPrice,
        originalPrice: cheapestPrice,
        imageUrl: productInfo.imageUrl,
        unit: '',
        size: '',
        brand: productInfo.brand,
        category: productInfo.category,
        inStock: true,
        discount: null,
        store: 'CHP (Multiple Stores)',
        productUrl: `${this.apiBase}/product/${productId}`,
        // Store top 7 cheapest prices for comparison
        pricesByStore: topPrices,
        dataSource: 'chp',
      };
    } catch (error) {
      console.error(`CHP getProductDetails error: ${error.message}`);
      // Fallback: return basic product info from autocomplete
      return await this.getBasicProductInfo(productId, barcode);
    }
  }

  /**
   * Get basic product info from autocomplete (fallback)
   */
  async getBasicProductInfo(productId, barcode) {
    try {
      const response = await axios.get(`${this.apiBase}${this.autocompleteEndpoint}`, {
        params: {
          term: barcode,
          from: 0,
          u: Math.random(),
        },
        headers: this.headers,
        timeout: 5000,
      });

      if (!response.data || !Array.isArray(response.data) || response.data.length === 0) {
        return null;
      }

      const product = response.data.find(item => 
        item.id === productId || (item.parts && item.parts.manufacturer_and_barcode && 
        item.parts.manufacturer_and_barcode.includes(barcode))
      );

      if (!product || !product.parts) {
        return null;
      }

      return this.parseAutocompleteProduct(product);
    } catch (error) {
      console.error(`CHP getBasicProductInfo error: ${error.message}`);
      return null;
    }
  }

  /**
   * Parse product from autocomplete API response
   */
  parseAutocompleteProduct(item) {
    if (!item.parts) {
      return null;
    }

    const parts = item.parts;
    
    // Extract barcode
    let barcode = '';
    if (parts.manufacturer_and_barcode) {
      const barcodeMatch = parts.manufacturer_and_barcode.match(/ברקוד:\s*(\d+)/);
      if (barcodeMatch) {
        barcode = barcodeMatch[1];
      }
    }

    // Extract brand
    let brand = '';
    if (parts.manufacturer_and_barcode) {
      const brandMatch = parts.manufacturer_and_barcode.match(/יצרן\/מותג:\s*([^,]+)/);
      if (brandMatch) {
        brand = brandMatch[1].trim();
      }
    }

    // Extract price range if available
    let price = null;
    if (parts.price_range) {
      if (Array.isArray(parts.price_range) && parts.price_range.length === 2) {
        price = parts.price_range[0]; // Use minimum price
      }
    }

    // Extract image
    let imageUrl = '';
    if (parts.small_image) {
      imageUrl = `data:image/png;base64,${parts.small_image}`;
    }

    return {
      name: parts.name_and_contents || item.value || item.label || 'Unknown Product',
      barcode: barcode,
      price: price,
      originalPrice: price,
      imageUrl: imageUrl,
      unit: parts.pack_size || '',
      size: parts.pack_size || '',
      brand: brand,
      category: '',
      inStock: true,
      discount: null,
      store: 'CHP',
      productUrl: `${this.apiBase}/product/${item.id}`,
      dataSource: 'chp',
    };
  }

  /**
   * Get store locations (CHP doesn't have physical stores)
   */
  async getStoreLocations() {
    // CHP is a price comparison website, not a physical store chain
    return [];
  }
}

module.exports = CHPScraper;

