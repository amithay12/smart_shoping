const scraperManager = require('../services/scrapers/scraperManager');
const Product = require('../models/Product');
const ShoppingList = require('../models/ShoppingList');

/**
 * @desc    Update prices for a specific product
 * @route   POST /api/scraper/update-product/:productId
 * @access  Private
 */
exports.updateProductPrices = async (req, res) => {
  try {
    const { productId } = req.params;

    const summary = await scraperManager.updateProductPrices(productId);

    res.status(200).json({
      success: true,
      message: `Updated prices for ${summary.storesUpdated} stores`,
      summary,
    });
  } catch (error) {
    console.error('Update product prices error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating product prices',
      error: error.message,
    });
  }
};

/**
 * @desc    Sync store locations from all scrapers
 * @route   POST /api/scraper/sync-stores
 * @access  Private (Admin)
 */
exports.syncStoreLocations = async (req, res) => {
  try {
    const summary = await scraperManager.syncStoreLocations();

    res.status(200).json({
      success: true,
      message: `Synced ${summary.storesCreated} new stores, updated ${summary.storesUpdated}`,
      summary,
    });
  } catch (error) {
    console.error('Sync stores error:', error);
    res.status(500).json({
      success: false,
      message: 'Error syncing store locations',
      error: error.message,
    });
  }
};

/**
 * @desc    Update prices for all products in user's shopping list
 * @route   POST /api/scraper/update-shopping-list
 * @access  Private
 */
exports.updateShoppingListPrices = async (req, res) => {
  try {
    const householdId = req.user.household;

    // Get shopping list
    const shoppingList = await ShoppingList.findOne({ household: householdId })
      .populate('items.product');

    if (!shoppingList) {
      return res.status(404).json({ message: 'Shopping list not found' });
    }

    // Get product IDs from list items
    const productIds = shoppingList.items
      .filter(item => item.product && !item.isPurchased)
      .map(item => item.product._id);

    if (productIds.length === 0) {
      return res.status(400).json({
        message: 'No products found in shopping list to update',
      });
    }

    const summary = await scraperManager.updatePricesForProducts(productIds);

    res.status(200).json({
      success: true,
      message: `Updated prices for ${summary.updated}/${summary.totalProducts} products`,
      summary,
    });
  } catch (error) {
    console.error('Update shopping list prices error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating shopping list prices',
      error: error.message,
    });
  }
};

/**
 * @desc    Search product across all stores (real-time)
 * @route   GET /api/scraper/search/:barcode
 * @access  Public
 */
exports.searchProductRealTime = async (req, res) => {
  try {
    const { barcode } = req.params;

    if (!barcode) {
      return res.status(400).json({ message: 'Barcode is required' });
    }

    const results = await scraperManager.searchProductAcrossStores(barcode);

    if (results.length === 0) {
      return res.status(404).json({
        message: 'Product not found in any store',
      });
    }

    res.status(200).json({
      success: true,
      products: results,
      count: results.length,
    });
  } catch (error) {
    console.error('Real-time search error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching products',
      error: error.message,
    });
  }
};

