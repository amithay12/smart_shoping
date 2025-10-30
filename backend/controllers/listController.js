const ShoppingList = require('../models/ShoppingList');
const ChangeHistory = require('../models/ChangeHistory');
const mongoose = require('mongoose');

// @desc    Get the user's shopping list
exports.getShoppingList = async (req, res) => {
  try {
    // req.user is attached by our "protect" middleware
    const householdId = req.user.household;

    const list = await ShoppingList.findOne({ household: householdId }).populate(
      'items.addedBy',
      'displayName email'
    );

    if (!list) {
      return res.status(404).json({ message: 'Shopping list not found' });
    }

    res.status(200).json(list);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Add an item to the list
exports.addItem = async (req, res) => {
  try {
    const { name, quantity } = req.body;
    const userId = req.user._id;
    const householdId = req.user.household;

    // 1. Create the new item object
    const newItem = {
      name,
      quantity: quantity || '1', // Default to '1' if no quantity is given
      addedBy: userId,
      isPurchased: false,
    };

    // 2. Find the household's list and push the new item into its "items" array
    const updatedList = await ShoppingList.findOneAndUpdate(
      { household: householdId },
      { $push: { items: newItem } },
      { new: true, runValidators: true } // "new: true" returns the *updated* document
    ).populate('items.addedBy', 'displayName email');

    // 3. Log this action in our ChangeHistory
    // We do this "in the background" (don't need to "await" it)
    ChangeHistory.create({
      household: householdId,
      user: userId,
      action: 'ADD_ITEM',
      itemDetails: {
        name: newItem.name,
        quantity: newItem.quantity,
      },
    });

    res.status(201).json(updatedList);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Update an item on the list
exports.updateItem = async (req, res) => {
  try {
    const { itemId } = req.params; // Get the item's ID from the URL
    const { name, quantity, isPurchased } = req.body; // Get the new data
    const householdId = req.user.household;
    const userId = req.user._id;

    // 1. Find the list
    const list = await ShoppingList.findOne({ household: householdId });
    if (!list) {
      return res.status(404).json({ message: 'List not found' });
    }

    // 2. Find the specific item in the list's "items" array
    const item = list.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    // 3. Store the *previous* state for our history log
    const previousState = {
      name: item.name,
      quantity: item.quantity,
      isPurchased: item.isPurchased
    };
    
    let actionType = 'UPDATE_ITEM'; // Default action

    // 4. Update the item's fields
    if (name !== undefined) item.name = name;
    if (quantity !== undefined) item.quantity = quantity;
    if (isPurchased !== undefined) {
      item.isPurchased = isPurchased;
      // If the "isPurchased" field is what changed, log it as a specific action
      if (previousState.isPurchased !== isPurchased) {
        actionType = isPurchased ? 'PURCHASE_ITEM' : 'UNDO_PURCHASE';
      }
    }

    // 5. Save the *entire* list document
    const updatedList = await list.save();

    // 6. Log this action
    ChangeHistory.create({
      household: householdId,
      user: userId,
      action: actionType,
      itemDetails: {
        name: item.name,
        quantity: item.quantity,
      },
      previousState: previousState, // Log the old data
    });

    // 7. Repopulate the data before sending it back
    const populatedList = await updatedList.populate('items.addedBy', 'displayName email');
    res.status(200).json(populatedList);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Remove an item from the list
exports.removeItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const householdId = req.user.household;
    const userId = req.user._id;

    // 1. Find the list
    const list = await ShoppingList.findOne({ household: householdId });
    if (!list) {
      return res.status(404).json({ message: 'List not found' });
    }

    // 2. Find the specific item
    const item = list.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Item not found' });
    }
    
    // 3. Log the details *before* we remove it
    ChangeHistory.create({
      household: householdId,
      user: userId,
      action: 'REMOVE_ITEM',
      itemDetails: {
        name: item.name,
        quantity: item.quantity,
      },
    });

    // 4. Remove the item from the array
    item.remove();
    
    // 5. Save the list
    await list.save();
    
    const populatedList = await list.populate('items.addedBy', 'displayName email');
    res.status(200).json(populatedList);
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};
