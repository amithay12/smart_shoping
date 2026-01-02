const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreProduct = require('../models/StoreProduct');
const { lookupBarcode, searchProducts } = require('../services/barcodeService');
const realPriceDownloader = require('../services/scrapers/realPriceDownloader');
const scraperManager = require('../services/scrapers/scraperManager');
const { getCHPLocationOptions } = require('../utils/locationHelper');

/**
 * @desc    Lookup product by barcode and fetch prices from all stores
 * @route   GET /api/products/barcode/:barcode
 * @access  Public
 */
exports.lookupByBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;
    // Get location from query params (city name in Hebrew, e.g., "תל אביב", "ירושלים")
    const { city, street, lat, lng } = req.query;

    if (!barcode || barcode.trim().length === 0) {
      return res.status(400).json({ message: 'Barcode is required' });
    }

    // Debug: Log raw query params
    console.log('Raw query params:', { city, street, lat, lng });
    console.log('City type:', typeof city, 'City value:', city);
    console.log('City truthy check:', !!city);

    // Prepare location options for CHP
    // CHP needs city name in Hebrew to show physical store prices
    // Convert coordinates to city name if needed
    const locationOptions = getCHPLocationOptions({ 
      city: city ? decodeURIComponent(city) : null, 
      street: street ? decodeURIComponent(street) : null, 
      lat: lat ? parseFloat(lat) : null, 
      lng: lng ? parseFloat(lng) : null 
    });
    console.log('Location options for CHP after function call:', locationOptions);
    console.log('Location options city:', locationOptions.city);

    // First, lookup product from database or external APIs
    const result = await lookupBarcode(barcode.trim());

    if (!result.success) {
      return res.status(404).json({
        message: result.message || 'Product not found',
      });
    }

    // Fetch prices from real price downloader for all supermarkets
    let pricesByStore = [];
    
    // Get or create product
    let product = await Product.findOne({ barcode: barcode.trim() });
    
    // If product not in database but found from external API, save it
    if (!product && result.product) {
      try {
        product = await Product.create({
          barcode: barcode.trim(),
          name: result.product.name || 'Unknown Product',
          brand: result.product.brand || '',
          category: result.product.category || '',
          images: result.product.images || [],
          dataSource: result.source || 'external',
        });
      } catch (error) {
        // If create fails (e.g., duplicate), try to find it again
        product = await Product.findOne({ barcode: barcode.trim() });
      }
    }
    
    // Get existing prices from database
    // Only show prices from stores we have real data for (Shufersal for now)
    if (product && product._id) {
      const shufersalStore = await Store.findOne({ chain: 'Shufersal' });
      
      if (shufersalStore) {
        const existingPrices = await StoreProduct.find({
          product: product._id,
          store: shufersalStore._id,
          isAvailable: true,
        })
        .populate('store', 'name chain')
        .sort({ lastPriceUpdate: -1 }) // Get most recent price
        .limit(1); // Only one price per store

        if (existingPrices.length > 0) {
          pricesByStore = existingPrices
            .filter(sp => sp.store && sp.store._id) // Filter out null stores
            .map(sp => ({
              store: {
                _id: sp.store._id,
                name: sp.store.name,
                chain: sp.store.chain,
                storeType: sp.store.storeType || 'physical',
              },
              price: sp.price,
              currency: sp.currency || 'ILS',
            }));
        }
      }
    }

    // Primary source: CHP (includes both online and physical store prices)
    // CHP aggregates prices from multiple Israeli supermarkets (both online and physical)
    // If city is provided, CHP will show prices from physical stores in that city
    let chpFoundPrices = false;
    
    if (pricesByStore.length === 0) {
      try {
        const locationInfo = locationOptions.city 
          ? ` (city: ${locationOptions.city})` 
          : locationOptions.street 
          ? ` (street: ${locationOptions.street})`
          : ' (online stores)';
        console.log(`Fetching prices from CHP for barcode ${barcode.trim()}${locationInfo}...`);
        console.log(`CHP locationOptions being sent:`, JSON.stringify(locationOptions));
        const chpScraper = scraperManager.scrapers['CHP'];
        if (chpScraper) {
          // Add timeout wrapper to prevent hanging
          console.log(`[CHP] Starting search with locationOptions:`, locationOptions);
          const chpResult = await Promise.race([
            chpScraper.searchByBarcode(barcode.trim(), locationOptions),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('CHP search timeout')), 15000) // Increased to 15 seconds for city searches
            ),
          ]).catch(error => {
            console.error(`[CHP] Search failed or timed out: ${error.message}`);
            console.error(`[CHP] Error stack:`, error.stack);
            return null;
          });
          
          console.log(`[CHP] Search result:`, chpResult ? `Found ${chpResult.pricesByStore?.length || 0} prices` : 'No result');
          
          if (chpResult) {
            // CHP returns prices from multiple stores (both online and physical)
            if (chpResult.pricesByStore && Array.isArray(chpResult.pricesByStore) && chpResult.pricesByStore.length > 0) {
              chpFoundPrices = true;
              
              // Save each price from CHP
              console.log(`[CHP] Processing ${chpResult.pricesByStore.length} prices`);
              for (const priceInfo of chpResult.pricesByStore) {
                // Determine store type: if city is provided, it's likely a physical store
                // Otherwise, it's likely an online store
                const storeType = locationOptions.city ? 'physical' : 'online';
                // Use chain from priceInfo if available, otherwise use store name
                const chainName = priceInfo.chain || priceInfo.store;
                const storeName = priceInfo.store || chainName;
                console.log(`[CHP] Price from store: "${storeName}", chain: "${chainName}", setting storeType to: ${storeType}`);
                
                // IMPORTANT: Create separate Store entries for each unique store name + chain combination
                // This allows multiple locations of the same chain to have separate StoreProduct entries
                // For physical stores, store name often differs by location (e.g., "נס ציונה" vs "ברקת סיטי נס ציונה")
                // For online stores, we still use chain + name to ensure uniqueness
                let store = await Store.findOne({ 
                  chain: chainName,
                  name: storeName,
                  storeType: storeType
                });
                
                if (!store) {
                  store = await Store.create({
                    name: storeName, // Store location/name (e.g., "נס ציונה", "רמי לוי באינטרנט")
                    chain: chainName, // Chain name (e.g., "סופר ברקת", "רמי לוי")
                    address: { fullAddress: locationOptions.city ? locationOptions.city : 'Israel' },
                    location: { type: 'Point', coordinates: [34.7818, 32.0853] },
                    isActive: true,
                    storeType: storeType,
                  });
                  console.log(`[CHP] Created new store: ${storeName} (${chainName})`);
                } else {
                  console.log(`[CHP] Using existing store: ${storeName} (${chainName})`);
                }

                // Ensure product exists
                if (!product && chpResult.name) {
                  try {
                    product = await Product.create({
                      barcode: barcode.trim(),
                      name: chpResult.name,
                      brand: chpResult.brand || '',
                      category: chpResult.category || '',
                      images: chpResult.imageUrl ? [chpResult.imageUrl] : [],
                      dataSource: 'chp',
                    });
                  } catch (error) {
                    product = await Product.findOne({ barcode: barcode.trim() });
                  }
                }

                // Save price
                if (product && product._id && priceInfo.price) {
                  await StoreProduct.findOneAndUpdate(
                    { product: product._id, store: store._id },
                    {
                      price: priceInfo.price,
                      currency: priceInfo.currency || 'ILS',
                      unitPrice: priceInfo.price,
                      isAvailable: true,
                      inStock: true,
                      lastPriceUpdate: new Date(),
                      $push: {
                        priceHistory: {
                          price: priceInfo.price,
                          date: new Date(),
                        },
                      },
                    },
                    { upsert: true, new: true }
                  );

                  const finalStoreType = store.storeType || storeType;
                  console.log(`[CHP] Adding price to response - Store: ${store.name}, Type: ${finalStoreType}, Price: ${priceInfo.price}`);
                  // Use chain from priceInfo if available (from CHP), otherwise use store.chain
                  const displayChain = priceInfo.chain || store.chain || '';
                  
                  pricesByStore.push({
                    store: {
                      _id: store._id,
                      name: store.name,
                      chain: displayChain, // Use chain from CHP (e.g., "שופרסל", "רמי לוי")
                      storeType: finalStoreType,
                    },
                    price: priceInfo.price,
                    currency: priceInfo.currency || 'ILS',
                    source: 'chp', // All prices from CHP
                  });
                }
              }
            } else {
              // CHP found product but no prices - update product info if needed
              if (chpResult.name && !product) {
                try {
                  product = await Product.create({
                    barcode: barcode.trim(),
                    name: chpResult.name,
                    brand: chpResult.brand || '',
                    category: chpResult.category || '',
                    images: chpResult.imageUrl ? [chpResult.imageUrl] : [],
                    dataSource: 'chp',
                  });
                } catch (error) {
                  product = await Product.findOne({ barcode: barcode.trim() });
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`[CHP] Error fetching prices: ${error.message}`);
      }
    }

    // Fallback: Only use government files if CHP didn't find prices
    // Government files provide physical store prices as backup
    if (!chpFoundPrices && pricesByStore.length === 0) {
      try {
        console.log(`CHP didn't find prices, trying government files for barcode ${barcode.trim()}...`);
        
        // Search in each supermarket's price files
        for (const supermarketName of ['Shufersal', 'Rami Levy', 'Yohananof']) {
          try {
            // Download and parse price file
            const products = await realPriceDownloader.downloadAndParse(supermarketName, 1000);
            
            // Find product by barcode
            const foundProduct = products.find(p => 
              p && p.barcode && (
                p.barcode === barcode.trim() ||
                p.barcode === String(barcode.trim()) ||
                p.barcode.replace(/\D/g, '') === String(barcode.trim()).replace(/\D/g, '')
              )
            );

            if (foundProduct && foundProduct.price) {
              // Get or create store
              let store = await Store.findOne({ chain: supermarketName });
              if (!store) {
                store = await Store.create({
                  name: `${supermarketName} - Main Store`,
                  chain: supermarketName,
                  address: {
                    fullAddress: 'Israel',
                  },
                  location: {
                    type: 'Point',
                    coordinates: [34.7818, 32.0853],
                  },
                  isActive: true,
                });
              }

            // Get or create product
            if (!product) {
              try {
                product = await Product.create({
                  barcode: barcode.trim(),
                  name: foundProduct.name || result.product?.name || 'Unknown Product',
                  brand: foundProduct.brand || result.product?.brand || '',
                  category: foundProduct.category || result.product?.category || '',
                  dataSource: 'government',
                });
              } catch (error) {
                // If create fails, try to find it
                product = await Product.findOne({ barcode: barcode.trim() });
              }
            }

              // Make sure product exists before saving price
              if (!product) {
                try {
                  product = await Product.create({
                    barcode: barcode.trim(),
                    name: foundProduct.name || result.product?.name || 'Unknown Product',
                    brand: foundProduct.brand || result.product?.brand || '',
                    category: foundProduct.category || result.product?.category || '',
                    dataSource: 'government',
                  });
                } catch (error) {
                  product = await Product.findOne({ barcode: barcode.trim() });
                }
              }

              // Save price only if product exists
              if (product && product._id) {
                await StoreProduct.findOneAndUpdate(
                  { product: product._id, store: store._id },
                  {
                    price: foundProduct.price,
                    currency: 'ILS',
                    unitPrice: foundProduct.price,
                    isAvailable: true,
                    inStock: true,
                    lastPriceUpdate: new Date(),
                    $push: {
                      priceHistory: {
                        price: foundProduct.price,
                        date: new Date(),
                      },
                    },
                  },
                  { upsert: true, new: true }
                );

                pricesByStore.push({
                  store: {
                    _id: store._id,
                    name: store.name,
                    chain: store.chain,
                  },
                  price: foundProduct.price,
                  currency: 'ILS',
                  source: 'government', // Mark as from government files (fallback)
                });
              }
            }
          } catch (error) {
            console.error(`Error fetching prices from ${supermarketName}:`, error.message);
            continue;
          }
        }
      } catch (error) {
        console.error('Error fetching prices from government files:', error.message);
      }
    }

    // Sort by price (cheapest first) and limit to top 7
    pricesByStore.sort((a, b) => a.price - b.price);
    pricesByStore = pricesByStore.slice(0, 7); // Limit to top 7 cheapest prices

    // Make sure we have a product to return
    if (!product && result.product) {
      // Product was found from external API but not saved yet
      product = result.product;
    }

    console.log(`[RESPONSE] Returning ${pricesByStore.length} prices:`);
    pricesByStore.forEach((p, idx) => {
      console.log(`  ${idx + 1}. ${p.store.name || p.store.chain} - Type: ${p.store.storeType || 'unknown'} - Price: ₪${p.price}`);
    });

    res.status(200).json({
      success: true,
      product: product ? (product.toObject ? product.toObject() : product) : result.product,
      source: result.source,
      prices: pricesByStore, // Prices from all stores (online + physical)
    });
  } catch (error) {
    console.error('Error in lookupByBarcode:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * @desc    Search products by name
 * @route   GET /api/products/search?q=query
 * @access  Public
 */
exports.searchProducts = async (req, res) => {
  try {
    const { q, limit } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const result = await searchProducts(q.trim(), parseInt(limit) || 20);

    res.status(200).json({
      success: result.success,
      products: result.products,
      count: result.products.length,
    });
  } catch (error) {
    console.error('Error in searchProducts:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * @desc    Get product by ID with prices from all stores
 * @route   GET /api/products/:productId
 * @access  Public
 */
exports.getProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Get prices from all stores
    const storeProducts = await StoreProduct.find({
      product: productId,
      isAvailable: true,
    })
      .populate('store', 'name chain storeType')
      .sort({ price: 1 }); // Sort by price ascending

    const prices = storeProducts.map(sp => ({
      store: {
        _id: sp.store._id,
        name: sp.store.name,
        chain: sp.store.chain,
        storeType: sp.store.storeType || 'physical',
      },
      price: sp.price,
      currency: sp.currency,
      unitPrice: sp.unitPrice,
      lastUpdate: sp.lastPriceUpdate,
    }));

    res.status(200).json({
      success: true,
      product: product.toObject(),
      prices: prices,
    });
  } catch (error) {
    console.error('Error in getProduct:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
