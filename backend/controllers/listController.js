// THIS IS THE TEXT-ONLY CODE FOR:
// backend/controllers/listController.js

const ShoppingList = require('../models/ShoppingList');
const ChangeHistory = require('../models/ChangeHistory');
const mongoose = require('mongoose');
const User = require('../models/User'); 

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

// Add item (no change)
exports.addItem = async (req, res) => {
  try {
    const { name, quantity } = req.body;
    const userId = req.user._id;
    const householdId = req.user.household;
    const newItem = {
      name,
      quantity: quantity || '1',
      addedBy: userId,
      isPurchased: false,
    };
    const updatedList = await ShoppingList.findOneAndUpdate(
      { household: householdId },
      { $push: { items: newItem } },
      { new: true, runValidators: true }
    );
    ChangeHistory.create({
      household: householdId,
      user: userId,
      action: 'ADD_ITEM',
      itemDetails: {
        name: newItem.name,
        quantity: newItem.quantity,
      },
    });
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
  console.log('--- BACKEND: updateItem FUNCTION CALLED ---'); // <-- DEBUG LOG
  try {
    const { itemId } = req.params;
    const { name, quantity, isPurchased } = req.body;
    const householdId = req.user.household;
    const userId = req.user._id;

    console.log(`BACKEND: Updating item ${itemId} to isPurchased: ${isPurchased}`); // <-- DEBUG LOG

    const list = await ShoppingList.findOne({ household: householdId });
    if (!list) {
      console.log('BACKEND: Error - List not found'); // <-- DEBUG LOG
      return res.status(404).json({ message: 'List not found' });
    }

    const item = list.items.id(itemId);
    if (!item) {
      console.log('BACKEND: Error - Item not found'); // <-- DEBUG LOG
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
    console.log('BACKEND: markModified("items") called.'); // <-- DEBUG LOG

    // Save the parent document
    await list.save();
    console.log('BACKEND: list.save() completed.'); // <-- DEBUG LOG
    
    // Find the item *after* saving to be 100% sure it saved
    const verifyList = await ShoppingList.findOne({ household: householdId });
    const verifiedItem = verifyList.items.id(itemId);
    console.log(`BACKEND: After save, isPurchased is: ${verifiedItem.isPurchased}`); // <-- DEBUG LOG

    // Log this action (no change)
    ChangeHistory.create({
      household: householdId,
      user: userId,
      action: actionType,
      itemDetails: {
        name: item.name,
        quantity: item.quantity,
      },
      previousState: previousState,
    });

    // Repopulate and send back
    const populatedList = await verifyList.populate('items.addedBy', 'displayName email');
    console.log('--- BACKEND: updateItem FUNCTION SUCCESS ---'); // <-- DEBUG LOG
    res.status(200).json(populatedList);

  } catch (error) {
    console.error('--- BACKEND: updateItem CRASHED ---:', error); // <-- DEBUG LOG
    res.status(500).json({ message: 'Server error' });
  }
};

// --- THIS IS THE UPDATED FUNCTION ---
// @desc    Remove an item
exports.removeItem = async (req, res) => {
  console.log('--- BACKEND: removeItem FUNCTION CALLED ---'); // <-- DEBUG LOG
  try {
    const { itemId } = req.params;
    const householdId = req.user.household;
    const userId = req.user._id;

    const list = await ShoppingList.findOne({ household: householdId });
    if (!list) {
      return res.status(404).json({ message: 'List not found' });
    }

    const item = list.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    // Log details (no change)
    ChangeHistory.create({
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
    console.log(`BACKEND: item.deleteOne() called for item ${itemId}`); // <-- DEBUG LOG
    
    await list.save();
    
    const populatedList = await list.populate('items.addedBy', 'displayName email');
    console.log('--- BACKEND: removeItem FUNCTION SUCCESS ---'); // <-- DEBUG LOG
    res.status(200).json(populatedList);
    
  } catch (error) {
    console.error('--- BACKEND: removeItem CRASHED ---:', error); // <-- DEBUG LOG
    res.status(500).json({ message: 'Server error' });
  }
};