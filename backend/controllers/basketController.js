const ShoppingList = require('../models/ShoppingList');
const Store = require('../models/Store');
const StoreProduct = require('../models/StoreProduct');
const Product = require('../models/Product');

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
    const { lat, lng, maxDistance = 50, maxStores = 3 } = req.query;

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

    // Get nearby stores
    let stores = [];
    if (lat && lng) {
      const coordinates = [parseFloat(lng), parseFloat(lat)];
      const distance = parseFloat(maxDistance) * 1000; // Convert km to meters

      stores = await Store.find({
        isActive: true,
        location: {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: coordinates,
            },
            $maxDistance: distance,
          },
        },
      }).limit(20); // Limit to 20 nearest stores
    } else {
      // If no location provided, get all active stores
      stores = await Store.find({ isActive: true }).limit(20);
    }

    if (stores.length === 0) {
      return res.status(404).json({ message: 'No stores found nearby' });
    }

    // Get product IDs from shopping list
    const productIds = unpurchasedItems
      .map(item => item.product)
      .filter(Boolean); // Remove null/undefined

    if (productIds.length === 0) {
      return res.status(400).json({
        message: 'No products linked to shopping list items. Please scan barcodes or link products first.',
      });
    }

    // Get all prices for these products at these stores
    const storeProducts = await StoreProduct.find({
      product: { $in: productIds },
      store: { $in: stores.map(s => s._id) },
      isAvailable: true,
      inStock: true,
    })
      .populate('product', 'name brand barcode')
      .populate('store', 'name chain address location');

    // Build price map: productId -> storeId -> price
    const priceMap = {};
    storeProducts.forEach(sp => {
      const productId = sp.product._id.toString();
      const storeId = sp.store._id.toString();

      if (!priceMap[productId]) {
        priceMap[productId] = {};
      }

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
          currency: 'USD',
          itemsFound,
          itemsTotal: unpurchasedItems.length,
          coverage: Math.round(coverage * 100) / 100,
          items,
        });
      }
    }

    // Option 2: Two stores (if we have enough stores)
    if (stores.length >= 2 && parseInt(maxStores) >= 2) {
      for (let i = 0; i < stores.length; i++) {
        for (let j = i + 1; j < stores.length; j++) {
          const store1 = stores[i];
          const store2 = stores[j];
          const store1Id = store1._id.toString();
          const store2Id = store2._id.toString();

          let totalPrice = 0;
          let itemsFound = 0;
          const items = [];

          for (const listItem of unpurchasedItems) {
            if (!listItem.product) continue;

            const productId = listItem.product._id.toString();
            const price1 = priceMap[productId]?.[store1Id];
            const price2 = priceMap[productId]?.[store2Id];

            if (price1 && price2) {
              // Choose cheaper option
              if (price1.price <= price2.price) {
                totalPrice += price1.price;
                items.push({
                  item: {
                    _id: listItem._id,
                    name: listItem.name,
                    quantity: listItem.quantity,
                  },
                  product: listItem.product,
                  price: price1.price,
                  currency: price1.currency,
                  store: store1.toObject(),
                });
              } else {
                totalPrice += price2.price;
                items.push({
                  item: {
                    _id: listItem._id,
                    name: listItem.name,
                    quantity: listItem.quantity,
                  },
                  product: listItem.product,
                  price: price2.price,
                  currency: price2.currency,
                  store: store2.toObject(),
                });
              }
              itemsFound++;
            } else if (price1) {
              totalPrice += price1.price;
              items.push({
                item: {
                  _id: listItem._id,
                  name: listItem.name,
                  quantity: listItem.quantity,
                },
                product: listItem.product,
                price: price1.price,
                currency: price1.currency,
                store: store1.toObject(),
              });
              itemsFound++;
            } else if (price2) {
              totalPrice += price2.price;
              items.push({
                item: {
                  _id: listItem._id,
                  name: listItem.name,
                  quantity: listItem.quantity,
                },
                product: listItem.product,
                price: price2.price,
                currency: price2.currency,
                store: store2.toObject(),
              });
              itemsFound++;
            }
          }

          if (itemsFound > 0) {
            const coverage = (itemsFound / unpurchasedItems.length) * 100;
            options.push({
              type: 'two_stores',
              stores: [store1.toObject(), store2.toObject()],
              totalPrice: Math.round(totalPrice * 100) / 100,
              currency: 'USD',
              itemsFound,
              itemsTotal: unpurchasedItems.length,
              coverage: Math.round(coverage * 100) / 100,
              items,
            });
          }
        }
      }
    }

    // Sort options by: coverage (desc), then price (asc)
    options.sort((a, b) => {
      if (Math.abs(a.coverage - b.coverage) > 0.01) {
        return b.coverage - a.coverage; // Higher coverage first
      }
      return a.totalPrice - b.totalPrice; // Lower price first
    });

    // Filter to only show options with good coverage (at least 2 stores that have all items)
    // Or show top 5 options
    const filteredOptions = options
      .filter(opt => {
        // Prefer options where at least 2-3 stores have all items
        if (opt.type === 'two_stores' && opt.coverage === 100) {
          return true;
        }
        // Or single store with good coverage
        if (opt.type === 'single_store' && opt.coverage >= 80) {
          return true;
        }
        return false;
      })
      .slice(0, 5); // Top 5 options

    // If no filtered options, return top options anyway
    const finalOptions = filteredOptions.length > 0 ? filteredOptions : options.slice(0, 5);

    res.status(200).json({
      success: true,
      options: finalOptions,
      totalOptions: options.length,
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

