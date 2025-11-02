const Household = require('../models/Household');
const ChangeHistory = require('../models/ChangeHistory');

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
