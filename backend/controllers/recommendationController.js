const ChangeHistory = require('../models/ChangeHistory');
const ShoppingList = require('../models/ShoppingList');

/**
 * @desc    Get smart recommendations (Personal + Global AI)
 * @route   GET /api/recommendations
 * @access  Private
 */
exports.getRecommendations = async (req, res) => {
  try {
    const householdId = req.user.household;

    // --- STEP 1: Fetch Current Shopping List ---
    // We need to know what is already on the list to:
    // A) Exclude them from recommendations
    // B) Find "Global Associations" (e.g., if list has "Burgers", recommend "Buns")
    const currentList = await ShoppingList.findOne({ household: householdId });
    const currentItems = currentList ? currentList.items : [];
    const currentItemNames = new Set(
      currentItems.map(item => item.name.toLowerCase().trim())
    );

    // --- STEP 2: Personal Repurchase Recommendations (Your existing logic) ---
    const purchaseHistory = await ChangeHistory.find({
      household: householdId,
      action: 'PURCHASE_ITEM',
      'itemDetails.name': { $exists: true, $ne: null, $ne: '' }
    })
    .sort({ createdAt: 1 })
    .lean();

    const personalRecs = calculatePersonalRecs(purchaseHistory, currentItemNames);

    // --- STEP 3: Global "Association" Recommendations (The New AI) ---
    // Only run this if the user has items on their list to match against
    let globalRecs = [];
    if (currentItems.length > 0) {
      globalRecs = await calculateGlobalAssociations(currentItems, currentItemNames);
    }

    // --- STEP 4: Combine & Deduplicate ---
    // Personal recs take priority. Global recs are added if not already suggested.
    const allRecommendations = [...personalRecs];
    
    globalRecs.forEach(globalItem => {
      // If not already recommended by personal AI
      if (!allRecommendations.find(r => r.name.toLowerCase() === globalItem.name.toLowerCase())) {
        allRecommendations.push(globalItem);
      }
    });

    res.status(200).json({
      recommendations: allRecommendations,
      count: allRecommendations.length,
      message: allRecommendations.length > 0 
        ? `Found ${allRecommendations.length} smart recommendations!`
        : 'Keep using the app to train the AI!'
    });

  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// --- Helper: Calculate Personal Repurchase Recommendations ---
function calculatePersonalRecs(purchaseHistory, currentItemNames) {
  if (!purchaseHistory || purchaseHistory.length === 0) return [];

  const itemStats = {};
  
  purchaseHistory.forEach(record => {
    const itemName = record.itemDetails.name.trim();
    const normalizedName = itemName.toLowerCase();
    
    if (!itemStats[normalizedName]) {
      itemStats[normalizedName] = {
        name: itemName, 
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

  return Object.values(itemStats)
    .filter(item => item.purchaseCount >= 3) 
    .map(item => {
      const purchases = item.purchases.sort((a, b) => a.date - b.date);
      const lastPurchase = purchases[purchases.length - 1];
      
      let totalDays = 0;
      let intervals = 0;
      for (let i = 1; i < purchases.length; i++) {
        totalDays += (purchases[i].date - purchases[i - 1].date) / (1000 * 60 * 60 * 24);
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
        reason: 'Buy Again', // UI can show "Buy Again"
        confidence: 'High',
        averageFrequencyDays: Math.round(averageFrequency * 10) / 10,
        daysSinceLastPurchase: Math.round(daysSinceLastPurchase * 10) / 10,
        shouldRecommend: daysSinceLastPurchase >= averageFrequency && averageFrequency > 0
      };
    })
    .filter(item => item.shouldRecommend && !currentItemNames.has(item.name.toLowerCase()));
}
// --- Helper: Calculate Global Association Recommendations ---
async function calculateGlobalAssociations(currentItems, currentItemNames) {
  console.log('--- STARTING GLOBAL AI SEARCH ---');
  
  // Use a Map to store unique recommendations by name
  // Key: "ItemName" -> Value: { recommendationObject }
  const uniqueRecs = new Map();
  
  const triggerItemNames = currentItems.map(i => i.name);

  for (const triggerName of triggerItemNames) {
    const matchingPurchases = await ChangeHistory.find({
      action: 'PURCHASE_ITEM',
      'itemDetails.name': { $regex: new RegExp(`^${triggerName}$`, 'i') }
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

    if (matchingPurchases.length === 0) continue;

    const associatedCounts = {};
    
    for (const purchase of matchingPurchases) {
      const purchaseTime = new Date(purchase.createdAt);
      // 24 Hour Window
      const oneHourBefore = new Date(purchaseTime.getTime() - 24 * 60 * 60 * 1000);
      const oneHourAfter = new Date(purchaseTime.getTime() + 24 * 60 * 60 * 1000);

      const basketMates = await ChangeHistory.find({
        household: purchase.household,
        action: 'PURCHASE_ITEM',
        createdAt: { $gte: oneHourBefore, $lte: oneHourAfter },
        'itemDetails.name': { $ne: purchase.itemDetails.name }
      }).lean();

      basketMates.forEach(mate => {
        const mateName = mate.itemDetails.name;
        if (!currentItemNames.has(mateName.toLowerCase())) {
           associatedCounts[mateName] = (associatedCounts[mateName] || 0) + 1;
        }
      });
    }

    const topAssociations = Object.entries(associatedCounts)
      .sort(([, countA], [, countB]) => countB - countA)
      .slice(0, 1);

    topAssociations.forEach(([name, count]) => {
      // Threshold: 10% (0.1) to allow more matches
      if (count > (matchingPurchases.length * 0.1)) {
         
         const newRec = {
           name: name,
           quantity: '1',
           reason: `People who bought ${triggerName} also bought this`,
           score: count, 
           confidence: 'Medium',
           averageFrequencyDays: 0,
           daysSinceLastPurchase: 0
         };

         // --- DEDUPLICATION LOGIC ---
         const lowerName = name.toLowerCase();
         if (uniqueRecs.has(lowerName)) {
            // If it already exists, keep the one with the higher score?
            // Or maybe just combine the reason? "People who bought egg AND ppp..."
            const existing = uniqueRecs.get(lowerName);
            if (newRec.score > existing.score) {
               uniqueRecs.set(lowerName, newRec); // Upgrade to better reason/score
            }
         } else {
            uniqueRecs.set(lowerName, newRec);
         }
      }
    });
  }

  // Convert Map back to Array
  const recommendations = Array.from(uniqueRecs.values());

  // Sort by score
  recommendations.sort((a, b) => b.score - a.score);

  console.log('Final Global Recs (Unique & Sorted):', recommendations.map(r => `${r.name} (${r.score})`));
  
  // Return top 5 UNIQUE items
  return recommendations.slice(0, 5);
}
