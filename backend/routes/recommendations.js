const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendationController');
const { protect } = require('../middleware/authMiddleware');

// All recommendation routes require authentication
// @route   GET /api/recommendations
// @desc    Get smart shopping recommendations based on purchase history
// @access  Private
router.get('/', protect, recommendationController.getRecommendations);

module.exports = router;

