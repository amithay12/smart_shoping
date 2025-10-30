const express = require('express');
const router = express.Router();
const listController = require('../controllers/listController');
const { protect } = require('../middleware/authMiddleware');

// We "protect" all of these routes. The user *must* be logged in.
// The `protect` function will run *before* the controller function.

// @route   GET /api/list/
// @desc    Get the user's current shopping list
router.get('/', protect, listController.getShoppingList);

// @route   POST /api/list/item
// @desc    Add a new item to the list
router.post('/item', protect, listController.addItem);

// @route   PUT /api/list/item/:itemId
// @desc    Update an item on the list (e.g., quantity or purchased status)
router.put('/item/:itemId', protect, listController.updateItem);

// @route   DELETE /api/list/item/:itemId
// @desc    Remove an item from the list
router.delete('/item/:itemId', protect, listController.removeItem);

module.exports = router;
