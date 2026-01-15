const express = require('express');
const router = express.Router();
const recommendationController = require('../controllers/recommendationController');
const { protect } = require('../middleware/authMiddleware');

// All recommendation routes require authentication
// @route   GET /api/recommendations
// @desc    Get smart shopping recommendations based on purchase history
// @access  Private
router.get('/', protect, recommendationController.getRecommendations);

// @route   POST /api/recommendations/decline
// @desc    Decline a product recommendation (mark as not interested)
// @access  Private
router.post('/decline', protect, recommendationController.declineRecommendation);

module.exports = router;

