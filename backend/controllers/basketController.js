const ShoppingList = require('../models/ShoppingList');
const Store = require('../models/Store');
const StoreProduct = require('../models/StoreProduct');
const Product = require('../models/Product');
const { geocodeCity } = require('../services/geocodingService');
const scraperManager = require('../services/scrapers/scraperManager');
const { getCHPLocationOptions } = require('../utils/locationHelper');

/**
 * Calculate distance between two coordinates using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Math.round(distance * 10) / 10; // Round to 1 decimal place
}

/**
 * Ensure we have CHP prices saved for a given product at the current location.
 * This is used by the basket optimizer so that products in the shopping list
 * get fresh store prices (similar to what the barcode lookup does).
 *
 * @param {Object} product - Mongoose Product document (must have barcode)
 * @param {Object} locationOptions - Output from getCHPLocationOptions
 */
async function ensureCHPPricesForProduct(product, locationOptions = {}) {
  try {
    if (!product || !product.barcode) {
      return;
    }

    const barcode = String(product.barcode).trim();
    if (!barcode) {
      return;
    }

    const chpScraper = scraperManager.scrapers['CHP'];
    if (!chpScraper) {
      return;
    }

    const locationInfo = locationOptions.address
      ? `address: ${locationOptions.address}`
      : locationOptions.city
      ? `city: ${locationOptions.city}`
      : 'online stores';

    console.log(
      `[Basket][CHP] Ensuring prices for barcode ${barcode} at ${locationInfo}...`
    );

    const chpResult = await Promise.race([
      chpScraper.searchByBarcode(barcode, locationOptions),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('CHP search timeout (basket)')), 15000)
      ),
    ]).catch((error) => {
      console.error(
        `[Basket][CHP] Search failed or timed out for ${barcode}: ${error.message}`
      );
      return null;
    });

    if (
      !chpResult ||
      !Array.isArray(chpResult.pricesByStore) ||
      chpResult.pricesByStore.length === 0
    ) {
      console.log(
        `[Basket][CHP] No pricesByStore returned for barcode ${barcode} at this location`
      );
      return;
    }

    console.log(
      `[Basket][CHP] Got ${chpResult.pricesByStore.length} prices for barcode ${barcode}`
    );

    // When we have address (e.g. "הרצל, נס ציונה") treat as physical and extract city for store matching
    const hasLocation = !!(locationOptions.address || locationOptions.city);
    const storeType = hasLocation ? 'physical' : 'online';
    let cityName = locationOptions.city ? locationOptions.city.trim() : null;
    if (!cityName && locationOptions.address) {
      const parts = String(locationOptions.address).split(/[,，]/);
      cityName = parts.length > 1 ? parts[parts.length - 1].trim() : locationOptions.address.trim();
    }

    for (const priceInfo of chpResult.pricesByStore) {
      const chainName = priceInfo.chain || priceInfo.store;
      const storeName = priceInfo.store || chainName;

      if (!storeName) {
        continue;
      }

      let store = await Store.findOne({
        chain: chainName,
        name: storeName,
        storeType: storeType,
      });

      if (!store) {
        store = await Store.create({
          name: storeName,
          chain: chainName,
          address: {
            city: cityName || undefined,
            fullAddress: cityName || locationOptions.address || 'Israel',
          },
          location: { type: 'Point', coordinates: [34.7818, 32.0853] },
          isActive: true,
          storeType: storeType,
        });
        console.log(
          `[Basket][CHP] Created new store for product prices: ${storeName} (${chainName}) in city: ${
            cityName || 'N/A'
          }`
        );
      } else if (cityName && !store.address?.city) {
        store.address = store.address || {};
        store.address.city = cityName;
        if (!store.address.fullAddress || store.address.fullAddress === 'Israel') {
          store.address.fullAddress = cityName;
        }
        await store.save();
        console.log(
          `[Basket][CHP] Updated existing store city for product prices: ${storeName} -> ${cityName}`
        );
      }

      if (product._id && priceInfo.price) {
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
      }
    }
  } catch (error) {
    console.error(
      `[Basket][CHP] Error ensuring prices for product ${product?._id}:`,
      error.message
    );
  }
}

/**
 * @desc    Get optimized shopping basket - finds cheapest combination of stores
 * @route   GET /api/basket/optimize
 * @access  Private
 * 
 * Algorithm:
 * 1. Get user's shopping list (unpurchased items)
 * 2. For each item, find prices at nearby stores
 * 3. Calculate total cost for each store combination
 * 4. Consider distance/feasibility
 * 5. Return best options (single store, 2-store, 3-store combinations)
 */
exports.optimizeBasket = async (req, res) => {
  try {
    const householdId = req.user.household;
    let { lat, lng, address, city, maxDistance = 50, maxStores = 3 } = req.query;

    // Support full addresses like chp.co.il (priority: address > city for backwards compatibility)
    const locationInput = address || city;
    
    // Extract city name from location input for city center fallback
    let cityName = null;
    let cityCenterLat = null;
    let cityCenterLng = null;
    
    if (locationInput && locationInput.trim()) {
      // Try to extract city name from full address (e.g., "הרצל נס ציונה" -> "נס ציונה")
      const locationName = locationInput.trim();
      const parts = locationName.split(/[,，]/); // Split by comma (Hebrew comma or regular comma)
      if (parts.length > 1) {
        // If comma exists, take the last part as city
        cityName = parts[parts.length - 1].trim();
      } else {
        // No comma - try to extract city by taking last 1-3 words
        const words = locationName.split(/\s+/);
        if (words.length > 1) {
          // Take last 2 words as potential city name (Hebrew cities are often 1-2 words)
          cityName = words.slice(-2).join(' ').trim();
        } else {
          // Single word - might be city name itself
          cityName = locationName;
        }
      }
      
      // Geocode city center for fallback distance calculation
      if (cityName) {
        console.log(`[Basket] Extracting city center for fallback: "${cityName}"`);
        try {
          const cityCenterCoords = await geocodeCity(cityName);
          if (cityCenterCoords && cityCenterCoords.lat && cityCenterCoords.lng) {
            cityCenterLat = cityCenterCoords.lat;
            cityCenterLng = cityCenterCoords.lng;
            console.log(`[Basket] ✅ City center "${cityName}" geocoded to: ${cityCenterLat}, ${cityCenterLng}`);
          } else {
            console.log(`[Basket] ⚠️ Failed to geocode city center for "${cityName}" - no coordinates returned`);
          }
        } catch (geocodeError) {
          console.log(`[Basket] ⚠️ Error geocoding city center for "${cityName}": ${geocodeError.message}`);
        }
      } else {
        console.log(`[Basket] ⚠️ Could not extract city name from location input: "${locationInput}"`);
      }
    }
    
    // If address/city is provided, geocode it to coordinates
    // But don't fail if geocoding doesn't work - we can still show stores with prices
    if (locationInput && locationInput.trim() && (!lat || !lng)) {
      console.log(`[Basket] Geocoding address/location: ${locationInput}`);
      const locationCoordinates = await geocodeCity(locationInput.trim());
      if (locationCoordinates) {
        lat = locationCoordinates.lat;
        lng = locationCoordinates.lng;
        console.log(`[Basket] Location "${locationInput}" geocoded to: ${lat}, ${lng}`);
      } else {
        console.log(`[Basket] Warning: Could not geocode location "${locationInput}", will show all stores with prices`);
        // Don't fail - we can still show stores that have prices for the products
        // Just won't filter by location
      }
    }

    // Get shopping list
    const shoppingList = await ShoppingList.findOne({ household: householdId })
      .populate('items.product', 'name brand barcode');

    if (!shoppingList) {
      return res.status(404).json({ message: 'Shopping list not found' });
    }

    // Filter unpurchased items
    const unpurchasedItems = shoppingList.items.filter(item => !item.isPurchased);

    if (unpurchasedItems.length === 0) {
      return res.status(200).json({
        message: 'No items to optimize - all items are purchased',
        options: [],
      });
    }

    // Get product refs from shopping list (may be populated docs or just ObjectIds)
    const productRefs = unpurchasedItems
      .map(item => item.product)
      .filter(Boolean); // Remove null/undefined

    if (productRefs.length === 0) {
      return res.status(400).json({
        message: 'No products linked to shopping list items. Please scan barcodes or link products first.',
      });
    }

    // Normalize to ObjectIds for queries (item.product can be populated doc with _id or raw ObjectId)
    const productIds = productRefs.map(p => (p && (p._id || p))).filter(Boolean);

    // Ensure we have CHP prices for all products in the basket at the current location
    const chpLocationOptions = getCHPLocationOptions({
      address: address ? decodeURIComponent(address) : null,
      city: city ? decodeURIComponent(city) : null,
    });

    // When user has a location, we need prices in stores that match that location.
    // Products may have prices in other stores (e.g. "Israel" or different city) - those won't show in compare.
    // So: only skip CHP if the product has at least one price in a store matching current location.
    let storeIdsMatchingLocation = [];
    if (locationInput && locationInput.trim()) {
      const locationName = locationInput.trim();
      const parts = locationName.split(/[,，]/);
      const cityNameForFilter = parts.length > 1 ? parts[parts.length - 1].trim() : locationName;
      const locationQuery = {
        $or: [
          { 'address.city': { $regex: cityNameForFilter, $options: 'i' } },
          { 'address.fullAddress': { $regex: cityNameForFilter, $options: 'i' } },
          { 'address.fullAddress': { $regex: locationName, $options: 'i' } },
        ],
        isActive: true,
      };
      storeIdsMatchingLocation = await Store.find(locationQuery).distinct('_id');
      console.log(`[Basket][CHP] Stores matching location "${cityNameForFilter}": ${storeIdsMatchingLocation.length}`);
    }

    const uniqueProductIdStrings = [...new Set(productIds.map(id => id.toString()))];

    for (const productIdStr of uniqueProductIdStrings) {
      try {
        const product = await Product.findById(productIdStr);
        if (!product || !product.barcode) {
          console.log(`[Basket][CHP] Skip product ${productIdStr}: no product or no barcode`);
          continue;
        }

        const barcodeStr = String(product.barcode).trim();
        const existingPriceCount = await StoreProduct.countDocuments({
          product: product._id,
          isAvailable: true,
          inStock: true,
        });

        if (storeIdsMatchingLocation.length > 0) {
          const pricesInMatchingStores = await StoreProduct.countDocuments({
            product: product._id,
            store: { $in: storeIdsMatchingLocation },
            isAvailable: true,
            inStock: true,
          });
          if (pricesInMatchingStores > 0) {
            console.log(`[Basket][CHP] Skip product ${product.name} (${barcodeStr}): already has ${pricesInMatchingStores} prices in location`);
            continue;
          }
          console.log(`[Basket][CHP] Ensuring prices for: ${product.name} (${barcodeStr}) - has ${existingPriceCount} prices elsewhere but 0 in current location`);
        } else {
          if (existingPriceCount > 0) {
            console.log(`[Basket][CHP] Skip product ${product.name} (${barcodeStr}): already has ${existingPriceCount} prices`);
            continue;
          }
          console.log(`[Basket][CHP] Ensuring prices for: ${product.name} (barcode ${barcodeStr})`);
        }

        await ensureCHPPricesForProduct(product, chpLocationOptions);
      } catch (priceError) {
        console.error(
          `[Basket][CHP] Error while ensuring prices for product ${productIdStr}:`,
          priceError.message
        );
      }
    }

    // First, find all stores that have prices for these products
    // This ensures we show all stores where products are available, not just nearby stores
    const storesWithPrices = await StoreProduct.find({
      product: { $in: productIds },
      isAvailable: true,
      inStock: true,
    }).distinct('store');

    // Get stores filtered by coordinates (like chp.co.il does - uses geocoded address)
    let stores = [];
    
    // If we have geocoded coordinates (from address or city), use them to find nearby stores
    if (lat && lng) {
      try {
        const coordinates = [parseFloat(lng), parseFloat(lat)];
        const distance = parseFloat(maxDistance) * 1000; // Convert km to meters

        console.log(`[Basket] Finding stores within ${maxDistance}km of coordinates: ${lat}, ${lng}`);

        if (storesWithPrices.length > 0) {
          stores = await Store.find({
            _id: { $in: storesWithPrices },
            isActive: true,
            location: {
              $exists: true,
              $near: {
                $geometry: {
                  type: 'Point',
                  coordinates: coordinates,
                },
                $maxDistance: distance,
              },
            },
          }).limit(100);
          console.log(`[Basket] Found ${stores.length} stores with prices within ${maxDistance}km`);
        }
      } catch (locationError) {
        console.log(`[Basket] Warning: Could not query stores by location: ${locationError.message}`);
      }
    } else if (locationInput && locationInput.trim()) {
      // If we have location input but no coordinates (geocoding failed), try city name matching as fallback
      const locationName = locationInput.trim();
      console.log(`[Basket] Geocoding failed, trying city name matching for: "${locationName}"`);
      
      // Try to extract city name from full address (e.g., "הרצל נס ציונה" -> "נס ציונה")
      // Common patterns: "street, city" or "street city" where city is usually at the end
      let cityName = locationName;
      const parts = locationName.split(/[,，]/); // Split by comma (Hebrew comma or regular comma)
      if (parts.length > 1) {
        // If comma exists, take the last part as city
        cityName = parts[parts.length - 1].trim();
      } else {
        // No comma - try to extract city by taking last 1-3 words
        const words = locationName.split(/\s+/);
        if (words.length > 1) {
          // Take last 2 words as potential city name (Hebrew cities are often 1-2 words)
          cityName = words.slice(-2).join(' ').trim();
        }
      }
      
      console.log(`[Basket] Extracted city name: "${cityName}" from address: "${locationName}"`);
      
      // Try matching with extracted city name, or fall back to full address matching
      const locationQuery = {
        $or: [
          { 'address.city': { $regex: cityName, $options: 'i' } },
          { 'address.fullAddress': { $regex: cityName, $options: 'i' } },
          // Also try full address match as fallback
          { 'address.fullAddress': { $regex: locationName, $options: 'i' } },
        ],
        isActive: true,
      };

      if (storesWithPrices.length > 0) {
        stores = await Store.find({
          _id: { $in: storesWithPrices },
          ...locationQuery,
        }).limit(100);
        console.log(`[Basket] Found ${stores.length} stores by city name matching`);
        
        // If city name matching found 0 stores, fall back to all stores with prices (no location filter)
        // This ensures we show stores that have prices even if they don't match the city name
        if (stores.length === 0) {
          console.log(`[Basket] City name matching found 0 stores, falling back to all stores with prices (no location filter)`);
          stores = await Store.find({
            _id: { $in: storesWithPrices },
            isActive: true,
          }).limit(100);
        }
      }
    } else {
      // No city or location provided - get all stores that have prices (no filter)
      if (storesWithPrices.length > 0) {
        stores = await Store.find({
          _id: { $in: storesWithPrices },
          isActive: true,
        });
        console.log(`[Basket] Found ${stores.length} stores with prices (no location filter)`);
      }
    }

    // If no stores found yet, get all active stores as fallback
    if (stores.length === 0) {
      console.log(`[Basket] No stores found with prices, falling back to all active stores`);
      stores = await Store.find({ isActive: true }).limit(100);
    }

    console.log(`[Basket] Total stores to consider: ${stores.length}`);

    if (stores.length === 0) {
      return res.status(404).json({ message: 'No stores found' });
    }

    const allStoreIds = stores.map(s => s._id);

    // Get distances from CHP when address is provided (like chp.co.il)
    // Query CHP for one product to get store distances, then use those distances for all stores
    const storeDistancesFromCHP = {}; // Map: store name/chain -> distance
    if (locationInput && locationInput.trim() && productIds.length > 0) {
      try {
        const locationOptions = getCHPLocationOptions({
          address: address ? decodeURIComponent(address) : null,
          city: city ? decodeURIComponent(city) : null,
        });
        
        // Query CHP for the first product with barcode to get distances
        const firstProduct = await Product.findById(productIds[0]);
        if (firstProduct && firstProduct.barcode) {
          console.log(`[Basket] Querying CHP for distances using product: ${firstProduct.name} (${firstProduct.barcode})`);
          const chpScraper = scraperManager.scrapers['CHP'];
          if (chpScraper) {
            const chpResult = await Promise.race([
              chpScraper.searchByBarcode(firstProduct.barcode, locationOptions),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('CHP distance fetch timeout')), 10000)
              ),
            ]).catch(error => {
              console.log(`[Basket] CHP distance fetch failed: ${error.message}`);
              return null;
            });
            
            if (chpResult && chpResult.pricesByStore && Array.isArray(chpResult.pricesByStore)) {
              console.log(`[Basket] CHP returned ${chpResult.pricesByStore.length} stores total`);
              // Build map of store name/chain -> distance from CHP
              chpResult.pricesByStore.forEach(priceInfo => {
                if (priceInfo.distance !== undefined && priceInfo.distance !== null) {
                  const storeName = priceInfo.store || '';
                  const chainName = priceInfo.chain || '';
                  
                  // Create multiple keys for flexible matching
                  if (storeName) {
                    storeDistancesFromCHP[storeName] = priceInfo.distance;
                    // Also try with chain prefix/suffix
                    if (chainName) {
                      storeDistancesFromCHP[`${chainName} ${storeName}`] = priceInfo.distance;
                      storeDistancesFromCHP[`${storeName} ${chainName}`] = priceInfo.distance;
                    }
                  }
                  if (chainName) {
                    storeDistancesFromCHP[chainName] = priceInfo.distance;
                  }
                  
                  // Debug: log what we're storing
                  console.log(`[Basket] Storing CHP distance: ${priceInfo.distance}km for store="${storeName}", chain="${chainName}"`);
                }
              });
              console.log(`[Basket] Got ${Object.keys(storeDistancesFromCHP).length} store distances from CHP`);
              console.log(`[Basket] CHP distance map:`, JSON.stringify(storeDistancesFromCHP, null, 2));
            } else {
              console.log(`[Basket] CHP result:`, chpResult ? 'result exists but no pricesByStore' : 'null/undefined');
            }
          }
        }
      } catch (error) {
        console.log(`[Basket] Error getting distances from CHP: ${error.message}`);
      }
    }

    // Get all prices for these products at these stores
    const storeProducts = await StoreProduct.find({
      product: { $in: productIds },
      store: { $in: allStoreIds },
      isAvailable: true,
      inStock: true,
    })
      .populate('product', 'name brand barcode')
      .populate('store', 'name chain address location storeType');

    // Build price map: productId -> storeId -> price
    const priceMap = {};
    
    storeProducts.forEach(sp => {
      const productId = sp.product._id.toString();
      const storeId = sp.store._id.toString();

      if (!priceMap[productId]) {
        priceMap[productId] = {};
      }

      // Map by store ID (each store gets its own entry)
      priceMap[productId][storeId] = {
        price: sp.price,
        currency: sp.currency,
        unitPrice: sp.unitPrice,
        storeProduct: sp,
      };
    });

    // Calculate basket options
    const options = [];

    // Option 1: Single store (simplest)
    for (const store of stores) {
      const storeId = store._id.toString();
      let totalPrice = 0;
      let itemsFound = 0;
      const items = [];

      for (const listItem of unpurchasedItems) {
        if (!listItem.product) continue;

        const productId = listItem.product._id.toString();
        const priceInfo = priceMap[productId]?.[storeId];

        if (priceInfo) {
          totalPrice += priceInfo.price;
          itemsFound++;
          items.push({
            item: {
              _id: listItem._id,
              name: listItem.name,
              quantity: listItem.quantity,
            },
            product: listItem.product,
            price: priceInfo.price,
            currency: priceInfo.currency,
          });
        }
      }

      if (itemsFound > 0) {
        const coverage = (itemsFound / unpurchasedItems.length) * 100;
        
        // Get distance from CHP if available (preferred - like chp.co.il), otherwise calculate from coordinates
        let storeWithDistance = store.toObject();
        let distance = null;
        
        // Priority 1: Use distance from CHP (when address is provided)
        if (Object.keys(storeDistancesFromCHP).length > 0) {
          // Try multiple matching strategies
          const storeName = store.name || '';
          const chainName = store.chain || '';
          
          // Try exact matches first
          distance = storeDistancesFromCHP[storeName] || 
                     storeDistancesFromCHP[chainName] ||
                     storeDistancesFromCHP[`${chainName} ${storeName}`] ||
                     storeDistancesFromCHP[`${storeName} ${chainName}`];
          
          // If no exact match, try partial matching (store name contains CHP key or vice versa)
          if (distance === null || distance === undefined) {
            for (const [key, dist] of Object.entries(storeDistancesFromCHP)) {
              // Check if store name or chain contains the key, or key contains store name/chain
              if ((storeName && (key.includes(storeName) || storeName.includes(key))) ||
                  (chainName && (key.includes(chainName) || chainName.includes(key)))) {
                distance = dist;
                console.log(`[Basket] Matched CHP distance via partial match: ${key} -> ${storeName}/${chainName}`);
                break;
              }
            }
          }
          
          if (distance !== null && distance !== undefined) {
            console.log(`[Basket] ✅ Using CHP distance ${distance}km for store: ${storeName} (${chainName})`);
          } else {
            console.log(`[Basket] ❌ No CHP distance match for store: "${storeName}" (chain: "${chainName}")`);
            console.log(`[Basket] Available CHP keys:`, Object.keys(storeDistancesFromCHP));
          }
        }
        
        // Priority 2: Calculate distance from user's specific address coordinates if CHP distance not available
        if ((distance === null || distance === undefined) && lat && lng) {
          if (store.location && store.location.coordinates && Array.isArray(store.location.coordinates) && store.location.coordinates.length >= 2) {
            const storeLat = store.location.coordinates[1];
            const storeLng = store.location.coordinates[0];
            // Validate coordinates are numbers
            if (typeof storeLat === 'number' && typeof storeLng === 'number' && !isNaN(storeLat) && !isNaN(storeLng)) {
              distance = calculateDistance(lat, lng, storeLat, storeLng);
              console.log(`[Basket] ✅ Calculated distance ${distance}km from user address for store: ${store.name}`);
            }
          }
        }
        
        // Priority 3: Calculate distance from city center if CHP and user address distances not available
        if ((distance === null || distance === undefined) && cityCenterLat && cityCenterLng) {
          if (store.location && store.location.coordinates && Array.isArray(store.location.coordinates) && store.location.coordinates.length >= 2) {
            const storeLat = store.location.coordinates[1];
            const storeLng = store.location.coordinates[0];
            // Validate coordinates are numbers
            if (typeof storeLat === 'number' && typeof storeLng === 'number' && !isNaN(storeLat) && !isNaN(storeLng)) {
              distance = calculateDistance(cityCenterLat, cityCenterLng, storeLat, storeLng);
              console.log(`[Basket] ✅ Calculated distance ${distance}km from city center "${cityName}" for store: ${store.name} (${store.chain})`);
            } else {
              console.log(`[Basket] ⚠️ Store has invalid coordinates: ${store.name} - lat: ${storeLat}, lng: ${storeLng}`);
            }
          } else {
            console.log(`[Basket] ⚠️ Store missing location coordinates: ${store.name} (${store.chain}) - location: ${JSON.stringify(store.location)}`);
          }
        }
        
        if (distance !== null && distance !== undefined) {
          storeWithDistance.distance = distance; // Distance in kilometers
          console.log(`[Basket] ✅ Set distance ${distance}km on store object: ${store.name} (${store.chain})`);
        } else {
          console.log(`[Basket] ⚠️ No distance set for store: ${store.name} (${store.chain}) - CHP: ${storeDistancesFromCHP[store.name] ? 'found' : 'not found'}, User coords: ${lat && lng ? 'yes' : 'no'}, City center: ${cityCenterLat && cityCenterLng ? 'yes' : 'no'}, Store coords: ${store.location?.coordinates ? 'yes' : 'no'}`);
        }
        
        options.push({
          type: 'single_store',
          stores: [storeWithDistance],
          totalPrice: Math.round(totalPrice * 100) / 100,
          currency: 'ILS',
          itemsFound,
          itemsTotal: unpurchasedItems.length,
          coverage: Math.round(coverage * 100) / 100,
          items, // Detailed items with prices
        });
      }
    }

    // Build product price comparison: productId -> { storeId: price, ... }
    const productPriceComparison = {};
    for (const listItem of unpurchasedItems) {
      if (!listItem.product) continue;
      const productId = listItem.product._id.toString();
      productPriceComparison[productId] = {};
      
      for (const store of stores) {
        const storeId = store._id.toString();
        const priceInfo = priceMap[productId]?.[storeId];
        if (priceInfo) {
          // Get distance from CHP if available (preferred - like chp.co.il), otherwise calculate from coordinates
          let storeWithDistance = store.toObject();
          let distance = null;
          
          // Priority 1: Use distance from CHP (when address is provided)
          if (Object.keys(storeDistancesFromCHP).length > 0) {
            const storeName = store.name || '';
            const chainName = store.chain || '';
            
            // Try exact matches first
            distance = storeDistancesFromCHP[storeName] || 
                       storeDistancesFromCHP[chainName] ||
                       storeDistancesFromCHP[`${chainName} ${storeName}`] ||
                       storeDistancesFromCHP[`${storeName} ${chainName}`];
            
            // If no exact match, try partial matching
            if (distance === null || distance === undefined) {
              for (const [key, dist] of Object.entries(storeDistancesFromCHP)) {
                if ((storeName && (key.includes(storeName) || storeName.includes(key))) ||
                    (chainName && (key.includes(chainName) || chainName.includes(key)))) {
                  distance = dist;
                  break;
                }
              }
            }
          }
          
          // Priority 2: Calculate distance from user's specific address coordinates if CHP distance not available
          if ((distance === null || distance === undefined) && lat && lng) {
            if (store.location && store.location.coordinates && Array.isArray(store.location.coordinates) && store.location.coordinates.length >= 2) {
              const storeLat = store.location.coordinates[1];
              const storeLng = store.location.coordinates[0];
              // Validate coordinates are numbers
              if (typeof storeLat === 'number' && typeof storeLng === 'number' && !isNaN(storeLat) && !isNaN(storeLng)) {
                distance = calculateDistance(lat, lng, storeLat, storeLng);
              }
            }
          }
          
          // Priority 3: Calculate distance from city center if CHP and user address distances not available
          if ((distance === null || distance === undefined) && cityCenterLat && cityCenterLng) {
            if (store.location && store.location.coordinates && Array.isArray(store.location.coordinates) && store.location.coordinates.length >= 2) {
              const storeLat = store.location.coordinates[1];
              const storeLng = store.location.coordinates[0];
              // Validate coordinates are numbers
              if (typeof storeLat === 'number' && typeof storeLng === 'number' && !isNaN(storeLat) && !isNaN(storeLng)) {
                distance = calculateDistance(cityCenterLat, cityCenterLng, storeLat, storeLng);
                console.log(`[Basket] ✅ Calculated distance ${distance}km from city center "${cityName}" for product price comparison - store: ${store.name}`);
              }
            }
          }
          
          if (distance !== null) {
            storeWithDistance.distance = distance; // Distance in kilometers
          }
          
          productPriceComparison[productId][storeId] = {
            price: priceInfo.price,
            currency: priceInfo.currency,
            store: storeWithDistance,
          };
        }
      }
    }

    // Sort options by: store type (physical first), then coverage (desc), then price (asc)
    options.sort((a, b) => {
      const storeA = a.stores[0];
      const storeB = b.stores[0];
      const typeA = storeA.storeType || 'physical';
      const typeB = storeB.storeType || 'physical';
      
      // Physical stores first
      if (typeA !== typeB) {
        if (typeA === 'physical') return -1;
        if (typeB === 'physical') return 1;
      }
      
      // Then by coverage
      if (Math.abs(a.coverage - b.coverage) > 0.01) {
        return b.coverage - a.coverage; // Higher coverage first
      }
      
      // Finally by price
      return a.totalPrice - b.totalPrice; // Lower price first
    });

    // Separate physical and online stores
    const physicalOptions = options.filter(opt => {
      const storeType = opt.stores[0]?.storeType || 'physical';
      return storeType === 'physical' && opt.type === 'single_store';
    });
    
    const onlineOptions = options.filter(opt => {
      const storeType = opt.stores[0]?.storeType || 'physical';
      return storeType === 'online' && opt.type === 'single_store';
    });

    // Combine: physical first, then online
    const finalOptions = [
      ...physicalOptions.slice(0, 10),
      ...onlineOptions.slice(0, 10),
    ];

    res.status(200).json({
      success: true,
      options: finalOptions,
      totalOptions: finalOptions.length,
      productPriceComparison, // Price comparison for each product across stores
      summary: {
        itemsTotal: unpurchasedItems.length,
        storesFound: stores.length,
        bestOption: finalOptions[0] || null,
      },
    });
  } catch (error) {
    console.error('Error in optimizeBasket:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


