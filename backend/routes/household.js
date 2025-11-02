const express = require('express');
const router = express.Router();
const householdController = require('../controllers/householdController');
const { protect } = require('../middleware/authMiddleware');

// We "protect" all of these routes. The user *must* be logged in.

// @route   GET /api/household/
// @desc    Get the user's household details (e.g., name, members)
router.get('/', protect, householdController.getHouseholdDetails);

// @route   GET /api/household/history
// @desc    Get the household's shopping list change history
router.get('/history', protect, householdController.getChangeHistory);

module.exports = router;
