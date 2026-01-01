const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const { protect } = require('../middleware/authMiddleware');

// Public routes
router.get('/', storeController.getStores);
router.get('/prices/:productId', storeController.getProductPrices);

// Protected routes (for admin/store managers to update prices)
router.post('/', protect, storeController.createStore);
router.post('/:storeId/products/:productId/price', protect, storeController.updateProductPrice);

module.exports = router;

