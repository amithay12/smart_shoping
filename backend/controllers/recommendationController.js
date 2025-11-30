const ChangeHistory = require('../models/ChangeHistory');
const ShoppingList = require('../models/ShoppingList');

/**
 * @desc    Get smart recommendations based on purchase history
 * @route   GET /api/recommendations
 * @access  Private
 * 
 * Algorithm:
 * 1. Analyze all PURCHASE_ITEM actions for the household
 * 2. Group items by name (case-insensitive)
 * 3. Calculate purchase frequency and average days between purchases
 * 4. Recommend items where: (days since last purchase) >= (average frequency)
 * 5. Exclude items already on the active shopping list
 */
exports.getRecommendations = async (req, res) => {
  try {
    const householdId = req.user.household;

    // Step 1: Get all purchase history for this household
    const purchaseHistory = await ChangeHistory.find({
      household: householdId,
      action: 'PURCHASE_ITEM',
      'itemDetails.name': { $exists: true, $ne: null, $ne: '' }
    })
      .sort({ createdAt: 1 }) // Sort chronologically
      .lean(); // Use lean() for better performance

    if (purchaseHistory.length === 0) {
      return res.status(200).json({
        recommendations: [],
        message: 'No purchase history found. Start shopping to get recommendations!'
      });
    }

    // Step 2: Group purchases by item name (normalized to lowercase)
    const itemStats = {};
    
    purchaseHistory.forEach(record => {
      const itemName = record.itemDetails.name.trim();
      const normalizedName = itemName.toLowerCase();
      
      if (!itemStats[normalizedName]) {
        itemStats[normalizedName] = {
          name: itemName, // Keep original casing for display
          purchases: [],
          purchaseCount: 0
        };
      }
      
      itemStats[normalizedName].purchases.push({
        date: new Date(record.createdAt),
        quantity: record.itemDetails.quantity || '1'
      });
      itemStats[normalizedName].purchaseCount++;
    });

    // Step 3: Calculate average frequency for each item
    const itemsWithFrequency = Object.values(itemStats)
      .filter(item => item.purchaseCount >= 3) // Only items purchased 3+ times
      .map(item => {
        const purchases = item.purchases.sort((a, b) => a.date - b.date);
        const lastPurchase = purchases[purchases.length - 1];
        
        // Calculate average days between purchases
        let totalDays = 0;
        let intervals = 0;
        
        for (let i = 1; i < purchases.length; i++) {
          const daysDiff = (purchases[i].date - purchases[i - 1].date) / (1000 * 60 * 60 * 24);
          totalDays += daysDiff;
          intervals++;
        }
        
        const averageFrequency = intervals > 0 ? totalDays / intervals : 0;
        const daysSinceLastPurchase = (Date.now() - lastPurchase.date) / (1000 * 60 * 60 * 24);
        
        // Get most common quantity
        const quantityCounts = {};
        purchases.forEach(p => {
          const qty = p.quantity || '1';
          quantityCounts[qty] = (quantityCounts[qty] || 0) + 1;
        });
        const mostCommonQuantity = Object.keys(quantityCounts).reduce((a, b) => 
          quantityCounts[a] > quantityCounts[b] ? a : b
        );

        return {
          name: item.name,
          quantity: mostCommonQuantity,
          purchaseCount: item.purchaseCount,
          averageFrequencyDays: Math.round(averageFrequency * 10) / 10, // Round to 1 decimal
          daysSinceLastPurchase: Math.round(daysSinceLastPurchase * 10) / 10,
          lastPurchaseDate: lastPurchase.date,
          shouldRecommend: daysSinceLastPurchase >= averageFrequency && averageFrequency > 0
        };
      })
      .filter(item => item.shouldRecommend); // Only items that should be recommended

    // Step 4: Get current shopping list to exclude items already on it
    const currentList = await ShoppingList.findOne({ household: householdId });
    const currentItemNames = new Set(
      (currentList?.items || []).map(item => item.name.toLowerCase().trim())
    );

    // Step 5: Filter out items already on the list
    const recommendations = itemsWithFrequency
      .filter(item => !currentItemNames.has(item.name.toLowerCase().trim()))
      .sort((a, b) => {
        // Sort by: purchase count (desc), then by days since last purchase (desc)
        if (b.purchaseCount !== a.purchaseCount) {
          return b.purchaseCount - a.purchaseCount;
        }
        return b.daysSinceLastPurchase - a.daysSinceLastPurchase;
      })
      .map(item => ({
        name: item.name,
        quantity: item.quantity,
        purchaseCount: item.purchaseCount,
        averageFrequencyDays: item.averageFrequencyDays,
        daysSinceLastPurchase: item.daysSinceLastPurchase,
        lastPurchaseDate: item.lastPurchaseDate
      }));

    res.status(200).json({
      recommendations,
      count: recommendations.length,
      message: recommendations.length > 0 
        ? `Found ${recommendations.length} smart recommendation${recommendations.length > 1 ? 's' : ''}!`
        : 'No recommendations at this time. Keep shopping to get personalized suggestions!'
    });

  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

