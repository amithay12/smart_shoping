const ShoppingList = require('../models/ShoppingList');
const Store = require('../models/Store');
const StoreProduct = require('../models/StoreProduct');
const Product = require('../models/Product');
const { geocodeCity } = require('../services/geocodingService');

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
    let { lat, lng, city, maxDistance = 50, maxStores = 3 } = req.query;

    // If city is provided, geocode it to coordinates
    // But don't fail if geocoding doesn't work - we can still show stores with prices
    if (city && city.trim() && (!lat || !lng)) {
      console.log(`[Basket] Geocoding city: ${city}`);
      const cityCoordinates = await geocodeCity(city.trim());
      if (cityCoordinates) {
        lat = cityCoordinates.lat;
        lng = cityCoordinates.lng;
        console.log(`[Basket] City "${city}" geocoded to: ${lat}, ${lng}`);
      } else {
        console.log(`[Basket] Warning: Could not geocode city "${city}", will show all stores with prices`);
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

    // Get product IDs from shopping list first
    const productIds = unpurchasedItems
      .map(item => item.product)
      .filter(Boolean); // Remove null/undefined

    if (productIds.length === 0) {
      return res.status(400).json({
        message: 'No products linked to shopping list items. Please scan barcodes or link products first.',
      });
    }

    // First, find all stores that have prices for these products
    // This ensures we show all stores where products are available, not just nearby stores
    const storesWithPrices = await StoreProduct.find({
      product: { $in: productIds },
      isAvailable: true,
      inStock: true,
    }).distinct('store');

    // Get stores filtered by city name (like chp.co.il does)
    let stores = [];
    
    // If city is provided, filter stores by city name in address (primary method)
    if (city && city.trim()) {
      const cityName = city.trim();
      console.log(`[Basket] Filtering stores by city name: "${cityName}"`);
      
      // Build query to match city name in address.city field (case-insensitive)
      // Also check fullAddress field as fallback
      const cityQuery = {
        $or: [
          { 'address.city': { $regex: cityName, $options: 'i' } }, // Case-insensitive match
          { 'address.fullAddress': { $regex: cityName, $options: 'i' } }, // Also check full address
        ],
        isActive: true,
      };

      // First, get stores that have prices AND match the city
      if (storesWithPrices.length > 0) {
        stores = await Store.find({
          _id: { $in: storesWithPrices },
          ...cityQuery,
        });
        console.log(`[Basket] Found ${stores.length} stores with prices in city "${cityName}"`);
      }

      // Also find other stores in the same city (they might have prices we haven't loaded yet)
      const cityStores = await Store.find(cityQuery).limit(100);
      console.log(`[Basket] Found ${cityStores.length} total stores in city "${cityName}"`);

      // Merge stores (avoid duplicates)
      const existingStoreIds = new Set(stores.map(s => s._id.toString()));
      for (const cityStore of cityStores) {
        if (!existingStoreIds.has(cityStore._id.toString())) {
          stores.push(cityStore);
        }
      }

      // If we have location coordinates, also add nearby stores within maxDistance as fallback
      if (lat && lng && stores.length === 0) {
        console.log(`[Basket] No stores found by city name, trying nearby stores by location...`);
        try {
          const coordinates = [parseFloat(lng), parseFloat(lat)];
          const distance = parseFloat(maxDistance) * 1000; // Convert km to meters

          if (storesWithPrices.length > 0) {
            const nearbyStores = await Store.find({
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
            }).limit(50);
            
            stores = nearbyStores;
            console.log(`[Basket] Found ${stores.length} nearby stores within ${maxDistance}km as fallback`);
          }
        } catch (locationError) {
          console.log(`[Basket] Warning: Could not query stores by location: ${locationError.message}`);
        }
      }
    } else if (lat && lng) {
      // Only coordinates provided (no city name) - use location-based filtering
      try {
        const coordinates = [parseFloat(lng), parseFloat(lat)];
        const distance = parseFloat(maxDistance) * 1000;

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
          });
          console.log(`[Basket] Found ${stores.length} stores with prices within ${maxDistance}km`);
        }
      } catch (locationError) {
        console.log(`[Basket] Warning: Could not query stores by location: ${locationError.message}`);
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
        options.push({
          type: 'single_store',
          stores: [store.toObject()],
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
          productPriceComparison[productId][storeId] = {
            price: priceInfo.price,
            currency: priceInfo.currency,
            store: store.toObject(),
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


