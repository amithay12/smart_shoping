const express = require('express');
const router = express.Router();
const basketController = require('../controllers/basketController');
const { protect } = require('../middleware/authMiddleware');

// All basket routes require authentication
router.get('/optimize', protect, basketController.optimizeBasket);

module.exports = router;

