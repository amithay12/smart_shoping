const Household = require('../models/Household');
const User = require('../models/User');
const ShoppingList = require('../models/ShoppingList');
const ChangeHistory = require('../models/ChangeHistory');
const mongoose = require('mongoose');

// @desc    Get the user's household details
exports.getHouseholdDetails = async (req, res) => {
  try {
    // req.user is attached by our "protect" middleware
    const householdId = req.user.household;

    // Find the household and "populate" the members field.
    // This replaces the User IDs with the actual User documents
    // We only select the 'displayName' and 'email' for security.
    const household = await Household.findById(householdId).populate(
      'members',
      'displayName email'
    );

    if (!household) {
      return res.status(404).json({ message: 'Household not found' });
    }

    res.status(200).json(household);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Get the household's shopping list change history
exports.getChangeHistory = async (req, res) => {
  try {
    const householdId = req.user.household;

    // Find all history records for this household
    // Sort them by "createdAt" in descending order (newest first)
    // We also populate the 'user' field to show *who* made the change
    const history = await ChangeHistory.find({ household: householdId })
      .sort({ createdAt: -1 })
      .populate('user', 'displayName email');

    res.status(200).json(history);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Join a household using invite code
// @route   POST /api/household/join
// @access  Private
exports.joinHousehold = async (req, res) => {
  try {
    const { inviteCode } = req.body;
    const userId = req.user._id;
    const currentUser = req.user;

    if (!inviteCode || !inviteCode.trim()) {
      return res.status(400).json({ message: 'Invite code is required' });
    }

    // Validate that inviteCode is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(inviteCode.trim())) {
      return res.status(400).json({ message: 'Invalid invite code format' });
    }

    const householdId = inviteCode.trim();

    // Find the household
    const household = await Household.findById(householdId);
    if (!household) {
      return res.status(404).json({ message: 'Household not found. Please check the invite code.' });
    }

    // Check if user is already a member
    if (household.members.some(memberId => memberId.toString() === userId.toString())) {
      return res.status(400).json({ message: 'You are already a member of this household' });
    }

    // Check if user is already in a different household
    if (currentUser.household) {
      const currentHouseholdId = currentUser.household.toString();
      
      // If trying to join the same household (shouldn't happen but check anyway)
      if (currentHouseholdId === householdId) {
        return res.status(400).json({ message: 'You are already a member of this household' });
      }

      // Remove user from old household
      const oldHousehold = await Household.findById(currentHouseholdId);
      if (oldHousehold) {
        oldHousehold.members = oldHousehold.members.filter(
          memberId => memberId.toString() !== userId.toString()
        );
        
        // If old household has no more members, delete it and its shopping list
        if (oldHousehold.members.length === 0) {
          await ShoppingList.deleteOne({ household: currentHouseholdId });
          await Household.deleteOne({ _id: currentHouseholdId });
        } else {
          await oldHousehold.save();
        }
      }
    }

    // Add user to new household
    household.members.push(userId);
    await household.save();

    // Update user's household reference
    currentUser.household = householdId;
    await currentUser.save();

    // Ensure shopping list exists for the household
    let shoppingList = await ShoppingList.findOne({ household: householdId });
    if (!shoppingList) {
      shoppingList = await ShoppingList.create({
        household: householdId,
        items: [],
      });
    }

    // Populate and return the household with members
    const populatedHousehold = await Household.findById(householdId).populate(
      'members',
      'displayName email'
    );

    res.status(200).json({
      message: 'Successfully joined household',
      household: populatedHousehold,
    });
  } catch (error) {
    console.error('Error joining household:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
