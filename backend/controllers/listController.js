// THIS IS THE TEXT-ONLY CODE FOR:
// backend/controllers/listController.js

const ShoppingList = require('../models/ShoppingList');
const ChangeHistory = require('../models/ChangeHistory');
const mongoose = require('mongoose');
const User = require('../models/User');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreProduct = require('../models/StoreProduct');
const scraperManager = require('../services/scrapers/scraperManager');
const { getCHPLocationOptions } = require('../utils/locationHelper'); 

// Get list (no change)
exports.getShoppingList = async (req, res) => {
  try {
    const householdId = req.user.household;
    const list = await ShoppingList.findOne({ household: householdId })
      .populate('items.addedBy', 'displayName email');
    if (!list) {
      return res.status(404).json({ message: 'Shopping list not found' });
    }
    res.status(200).json(list);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Helper function to fetch prices with location (runs in background)
async function fetchPricesForProduct(productId, barcode, locationOptions) {
  // Run in background - don't block the response
  setImmediate(async () => {
    try {
      if (!barcode) return;

      const chpScraper = scraperManager.scrapers['CHP'];
      if (!chpScraper) return;

      const product = await Product.findById(productId);
      if (!product) return;

      console.log(`[Background] Fetching prices for product ${product.name} (${barcode}) in city: ${locationOptions.city || 'online'}`);

      // Use the product ID format from CHP (format: store_code_barcode)
      // For now, just use barcode - CHP will handle the lookup
      const chpResult = await Promise.race([
        chpScraper.searchByBarcode(barcode, locationOptions),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('CHP price fetch timeout')), 15000)
        ),
      ]).catch(error => {
        console.error(`[Background] CHP price fetch failed: ${error.message}`);
        return null;
      });

      if (chpResult && chpResult.pricesByStore && Array.isArray(chpResult.pricesByStore)) {
        for (const priceInfo of chpResult.pricesByStore) {
          const storeType = locationOptions.city ? 'physical' : 'online';
          const chainName = priceInfo.chain || priceInfo.store;
          const storeName = priceInfo.store || chainName;

          let store = await Store.findOne({
            chain: chainName,
            name: storeName,
            storeType: storeType
          });

          if (!store) {
            const cityName = locationOptions.city ? locationOptions.city.trim() : null;
            store = await Store.create({
              name: storeName,
              chain: chainName,
              address: { 
                city: cityName || undefined,
                fullAddress: cityName || 'Israel' 
              },
              location: { type: 'Point', coordinates: [34.7818, 32.0853] },
              isActive: true,
              storeType: storeType,
            });
          } else {
            // Update existing store's city if it's missing and we have city info
            if (locationOptions.city && !store.address?.city) {
              store.address = store.address || {};
              store.address.city = locationOptions.city.trim();
              if (!store.address.fullAddress || store.address.fullAddress === 'Israel') {
                store.address.fullAddress = locationOptions.city.trim();
              }
              await store.save();
            }
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
        console.log(`[Background] Fetched ${chpResult.pricesByStore.length} prices for ${product.name}`);
      }
    } catch (error) {
      console.error(`[Background] Error fetching prices: ${error.message}`);
    }
  });
}

// Add item
exports.addItem = async (req, res) => {
  try {
    const { name, quantity, productId, barcode, address, city, lat, lng } = req.body;
    
    // Basic input validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ message: 'Item name is required and cannot be empty' });
    }
    
    if (name.trim().length > 200) {
      return res.status(400).json({ message: 'Item name is too long (max 200 characters)' });
    }
    
    const userId = req.user._id;
    const householdId = req.user.household;
    const newItem = {
      name,
      quantity: quantity || '1',
      addedBy: userId,
      isPurchased: false,
    };

    // Link to product if provided (for price comparison)
    if (productId) {
      newItem.product = productId;
    }
    if (barcode) {
      newItem.barcode = barcode;
    }
    const updatedList = await ShoppingList.findOneAndUpdate(
      { household: householdId },
      { $push: { items: newItem } },
      { new: true, runValidators: true }
    );
    await ChangeHistory.create({
      household: householdId,
      user: userId,
      action: 'ADD_ITEM',
      itemDetails: {
        name: newItem.name,
        quantity: newItem.quantity,
        product: newItem.product || null,
        barcode: newItem.barcode || null,
      },
    });

    // If product has barcode and location is provided, fetch prices in background
    if (barcode && productId && (address || city || lat || lng)) {
      const locationOptions = getCHPLocationOptions({
        address: address ? (typeof address === 'string' ? address : decodeURIComponent(address)) : null,
        city: city ? (typeof city === 'string' ? city : decodeURIComponent(city)) : null,
        lat: lat ? parseFloat(lat) : null,
        lng: lng ? parseFloat(lng) : null,
      });
      fetchPricesForProduct(productId, barcode, locationOptions);
    }

    const populatedList = await updatedList.populate('items.addedBy', 'displayName email');
    res.status(201).json(populatedList);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// --- THIS IS THE UPDATED FUNCTION ---
// @desc    Update an item
exports.updateItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { name, quantity, isPurchased } = req.body;
    const householdId = req.user.household;
    const userId = req.user._id;

    // Validate itemId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ message: 'Invalid item ID' });
    }

    const list = await ShoppingList.findOne({ household: householdId });
    if (!list) {
      return res.status(404).json({ message: 'List not found' });
    }

    const item = list.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    const previousState = {
      name: item.name,
      quantity: item.quantity,
      isPurchased: item.isPurchased
    };
    
    let actionType = 'UPDATE_ITEM';

    // Update the item's fields in memory
    if (name !== undefined) item.name = name;
    if (quantity !== undefined) item.quantity = quantity;
    if (isPurchased !== undefined) {
      item.isPurchased = isPurchased;
      if (previousState.isPurchased !== isPurchased) {
        actionType = isPurchased ? 'PURCHASE_ITEM' : 'UNDO_PURCHASE';
      }
    }
    
    // This is the fix we added before
    list.markModified('items');

    // Save the parent document
    await list.save();
    
    // Find the item *after* saving to be 100% sure it saved
    const verifyList = await ShoppingList.findOne({ household: householdId });
    const verifiedItem = verifyList.items.id(itemId);

    // Log this action
    await ChangeHistory.create({
      household: householdId,
      user: userId,
      action: actionType,
      itemDetails: {
        name: item.name,
        quantity: item.quantity,
        product: item.product || null, // Store product reference if available
        barcode: item.barcode || null, // Store barcode if available
      },
      previousState: previousState,
    });

    // Repopulate and send back
    const populatedList = await verifyList.populate('items.addedBy', 'displayName email');
    res.status(200).json(populatedList);

  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// --- THIS IS THE UPDATED FUNCTION ---
// @desc    Remove an item
exports.removeItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const householdId = req.user.household;
    const userId = req.user._id;

    // Validate itemId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ message: 'Invalid item ID' });
    }

    const list = await ShoppingList.findOne({ household: householdId });
    if (!list) {
      return res.status(404).json({ message: 'List not found' });
    }

    const item = list.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    // Log details
    await ChangeHistory.create({
      household: householdId,
      user: userId,
      action: 'REMOVE_ITEM',
      itemDetails: {
        name: item.name,
        quantity: item.quantity,
      },
    });

    // This is the fix from before
    await item.deleteOne();
    await list.save();
    
    const populatedList = await list.populate('items.addedBy', 'displayName email');
    res.status(200).json(populatedList);
    
  } catch (error) {
    console.error('Error removing item:', error);
    res.status(500).json({ message: 'Server error' });
  }
};