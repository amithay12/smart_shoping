const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');

// Product routes (public for now, can add auth if needed)
router.get('/barcode/:barcode', productController.lookupByBarcode);
router.get('/search', productController.searchProducts);
router.get('/:productId', productController.getProduct);

module.exports = router;

