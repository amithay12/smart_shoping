const express = require('express');
const router = express.Router();
const scraperController = require('../controllers/scraperController');
const { protect } = require('../middleware/authMiddleware');

// Public route - real-time product search
router.get('/search/:barcode', scraperController.searchProductRealTime);

// Protected routes - price updates
router.post('/update-product/:productId', protect, scraperController.updateProductPrices);
router.post('/update-shopping-list', protect, scraperController.updateShoppingListPrices);
router.post('/sync-stores', protect, scraperController.syncStoreLocations);

module.exports = router;

