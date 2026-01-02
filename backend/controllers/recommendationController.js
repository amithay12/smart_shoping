const ChangeHistory = require('../models/ChangeHistory');
const ShoppingList = require('../models/ShoppingList');
const Product = require('../models/Product');

/**
 * @desc    Get smart recommendations based on user purchase patterns
 * @route   GET /api/recommendations
 * @access  Private
 * 
 * Algorithm:
 * 1. Get all purchase history for the household
 * 2. Group purchases by product (by barcode or product ID, fallback to name)
 * 3. Calculate average purchase interval for each product
 * 4. Check if interval has passed since last purchase
 * 5. Exclude products already on the current shopping list
 * 6. Return products with full details (barcode, name, etc.)
 */
exports.getRecommendations = async (req, res) => {
  try {
    const householdId = req.user.household;

    // Get current shopping list to exclude items already on it
    const currentList = await ShoppingList.findOne({ household: householdId });
    const currentItems = currentList ? currentList.items : [];
    const currentItemBarcodes = new Set(
      currentItems
        .map(item => item.barcode)
        .filter(Boolean)
    );
    const currentItemProductIds = new Set(
      currentItems
        .map(item => item.product?.toString())
        .filter(Boolean)
    );
    const currentItemNames = new Set(
      currentItems.map(item => item.name.toLowerCase().trim())
    );

    // Get all purchase history for this household
    const purchaseHistory = await ChangeHistory.find({
      household: householdId,
      action: 'PURCHASE_ITEM',
      'itemDetails.name': { $exists: true, $ne: null, $ne: '' }
    })
      .populate('itemDetails.product', 'name brand barcode category imageUrl')
      .sort({ createdAt: 1 })
      .lean();

    if (!purchaseHistory || purchaseHistory.length === 0) {
      return res.status(200).json({
        recommendations: [],
        count: 0,
        message: 'Keep shopping and marking items as purchased to get personalized recommendations!'
      });
    }

    // Group purchases by product identifier (barcode > product ID > name)
    const productStats = {};

    purchaseHistory.forEach(record => {
      const itemDetails = record.itemDetails || {};
      const product = itemDetails.product;
      const barcode = itemDetails.barcode || (product && product.barcode);
      const productId = itemDetails.product?._id?.toString() || (product && product._id?.toString());
      const name = itemDetails.name?.trim() || (product && product.name) || '';

      if (!name) return; // Skip if no name

      // Use barcode as primary key, fallback to product ID, then name
      const key = barcode || productId || name.toLowerCase();
      const keyType = barcode ? 'barcode' : (productId ? 'productId' : 'name');

      if (!productStats[key]) {
        productStats[key] = {
          key,
          keyType,
          name: name,
          productId: productId || null,
          barcode: barcode || null,
          product: product || null,
          purchases: [],
          purchaseCount: 0,
        };
      }

      productStats[key].purchases.push({
        date: new Date(record.createdAt),
        quantity: itemDetails.quantity || '1',
      });
      productStats[key].purchaseCount++;
    });

    // Calculate recommendations
    const recommendations = [];

    for (const [key, stats] of Object.entries(productStats)) {
      // Need at least 2 purchases to calculate an interval
      if (stats.purchaseCount < 2) continue;

      // Sort purchases by date
      const purchases = stats.purchases.sort((a, b) => a.date - b.date);
      const lastPurchase = purchases[purchases.length - 1];

      // Calculate average interval between purchases
      let totalDays = 0;
      let intervals = 0;
      for (let i = 1; i < purchases.length; i++) {
        const daysBetween = (purchases[i].date - purchases[i - 1].date) / (1000 * 60 * 60 * 24);
        totalDays += daysBetween;
        intervals++;
      }

      const averageFrequencyDays = intervals > 0 ? totalDays / intervals : 0;
      const daysSinceLastPurchase = (Date.now() - lastPurchase.date) / (1000 * 60 * 60 * 24);

      // Check if we should recommend this product
      // Recommend if: days since last purchase >= average frequency
      if (daysSinceLastPurchase < averageFrequencyDays) continue;

      // Skip if already on the shopping list
      if (stats.barcode && currentItemBarcodes.has(stats.barcode)) continue;
      if (stats.productId && currentItemProductIds.has(stats.productId)) continue;
      if (currentItemNames.has(stats.name.toLowerCase())) continue;

      // Get most common quantity
      const quantityCounts = {};
      purchases.forEach(p => {
        const qty = p.quantity || '1';
        quantityCounts[qty] = (quantityCounts[qty] || 0) + 1;
      });
      const mostCommonQuantity = Object.keys(quantityCounts).reduce((a, b) =>
        quantityCounts[a] > quantityCounts[b] ? a : b
      );

      // Try to get full product details if we have barcode or product ID
      let productData = null;
      if (stats.barcode) {
        productData = await Product.findOne({ barcode: stats.barcode }).lean();
      } else if (stats.productId) {
        productData = await Product.findById(stats.productId).lean();
      }

      // If product exists in DB, use it; otherwise use data from purchase history
      const recommendedProduct = productData || stats.product || {
        name: stats.name,
        barcode: stats.barcode || null,
        brand: null,
        category: null,
        imageUrl: null,
      };

      recommendations.push({
        name: recommendedProduct.name || stats.name,
        barcode: recommendedProduct.barcode || stats.barcode || null,
        productId: recommendedProduct._id?.toString() || stats.productId || null,
        brand: recommendedProduct.brand || null,
        category: recommendedProduct.category || null,
        imageUrl: recommendedProduct.imageUrl || null,
        quantity: mostCommonQuantity,
        averageFrequencyDays: Math.round(averageFrequencyDays * 10) / 10,
        daysSinceLastPurchase: Math.round(daysSinceLastPurchase * 10) / 10,
        purchaseCount: stats.purchaseCount,
        lastPurchaseDate: lastPurchase.date,
        reason: `Usually buy every ${Math.round(averageFrequencyDays)} days`,
      });
    }

    // Sort by days since last purchase (most overdue first)
    recommendations.sort((a, b) => b.daysSinceLastPurchase - a.daysSinceLastPurchase);

    // --- STEP 2: Global Association Recommendations ---
    // Find products that are frequently bought together with items in user's current list
    let globalRecommendations = [];
    if (currentItems.length > 0) {
      globalRecommendations = await calculateGlobalAssociations(
        currentItems,
        currentItemBarcodes,
        currentItemProductIds,
        currentItemNames
      );
    }

    // --- STEP 3: Combine and Deduplicate ---
    // Personal recommendations take priority
    const allRecommendations = [...recommendations];
    const recommendedBarcodes = new Set(recommendations.map(r => r.barcode).filter(Boolean));
    const recommendedProductIds = new Set(recommendations.map(r => r.productId).filter(Boolean));
    const recommendedNames = new Set(recommendations.map(r => r.name.toLowerCase()));

    // Add global recommendations that aren't already recommended
    globalRecommendations.forEach(globalRec => {
      const isDuplicate = 
        (globalRec.barcode && recommendedBarcodes.has(globalRec.barcode)) ||
        (globalRec.productId && recommendedProductIds.has(globalRec.productId)) ||
        recommendedNames.has(globalRec.name.toLowerCase());
      
      if (!isDuplicate) {
        allRecommendations.push({
          ...globalRec,
          source: 'global', // Mark as global recommendation
        });
      }
    });

    // Sort combined list (personal first, then global by score)
    allRecommendations.sort((a, b) => {
      if (a.source === 'global' && b.source !== 'global') return 1;
      if (a.source !== 'global' && b.source === 'global') return -1;
      if (a.source === 'global' && b.source === 'global') {
        return (b.score || 0) - (a.score || 0);
      }
      return b.daysSinceLastPurchase - a.daysSinceLastPurchase;
    });

    res.status(200).json({
      recommendations: allRecommendations,
      count: allRecommendations.length,
      message: allRecommendations.length > 0
        ? `Found ${allRecommendations.length} recommendation${allRecommendations.length > 1 ? 's' : ''} for you`
        : 'Keep shopping to get personalized recommendations!'
    });

  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * Calculate global association recommendations
 * Finds products frequently bought together with items in user's current list
 */
async function calculateGlobalAssociations(currentItems, currentItemBarcodes, currentItemProductIds, currentItemNames) {
  try {
    console.log('[GlobalRecs] Starting global association calculation...');

    const recommendations = [];
    const seenProducts = new Set(); // Track products we've already recommended

    // Get barcodes and product IDs from current list
    const triggerBarcodes = currentItems
      .map(item => item.barcode)
      .filter(Boolean);
    const triggerProductIds = currentItems
      .map(item => item.product?.toString())
      .filter(Boolean);
    const triggerNames = currentItems.map(item => item.name.toLowerCase());

    // For each item in user's current list, find what other users bought with it
    for (const currentItem of currentItems.slice(0, 10)) { // Limit to first 10 items for performance
      const itemBarcode = currentItem.barcode;
      const itemProductId = currentItem.product?.toString();
      const itemName = currentItem.name;

      if (!itemBarcode && !itemProductId) continue; // Skip items without product reference

      // Find all users who purchased this product (using barcode or product ID)
      const matchingPurchases = await ChangeHistory.find({
        action: 'PURCHASE_ITEM',
        $or: [
          { 'itemDetails.barcode': itemBarcode },
          { 'itemDetails.product': itemProductId },
        ],
      })
        .sort({ createdAt: -1 })
        .limit(100) // Limit for performance
        .lean();

      if (matchingPurchases.length < 3) continue; // Need at least 3 purchases to find associations

      // For each purchase, find what else that user bought around the same time (within 3 days)
      const associatedCounts = {};
      const userHouseholds = new Set();

      for (const purchase of matchingPurchases) {
        const purchaseHousehold = purchase.household.toString();
        const purchaseDate = new Date(purchase.createdAt);
        const threeDaysBefore = new Date(purchaseDate.getTime() - 3 * 24 * 60 * 60 * 1000);
        const threeDaysAfter = new Date(purchaseDate.getTime() + 3 * 24 * 60 * 60 * 1000);

        // Find other items purchased by the same household around the same time
        const basketMates = await ChangeHistory.find({
          household: purchase.household,
          action: 'PURCHASE_ITEM',
          createdAt: { $gte: threeDaysBefore, $lte: threeDaysAfter },
          _id: { $ne: purchase._id },
          $or: [
            { 'itemDetails.barcode': { $ne: itemBarcode } },
            { 'itemDetails.product': { $ne: itemProductId } },
          ],
        })
          .populate('itemDetails.product', 'name brand barcode category imageUrl')
          .lean();

        basketMates.forEach(mate => {
          const mateBarcode = mate.itemDetails?.barcode;
          const mateProductId = mate.itemDetails?.product?._id?.toString();
          const mateName = mate.itemDetails?.name;

          if (!mateName) return;

          // Skip if already on user's list
          if (mateBarcode && currentItemBarcodes.has(mateBarcode)) return;
          if (mateProductId && currentItemProductIds.has(mateProductId)) return;
          if (currentItemNames.has(mateName.toLowerCase())) return;

          // Use barcode as key if available, otherwise product ID, otherwise name
          const key = mateBarcode || mateProductId || mateName.toLowerCase();

          if (!associatedCounts[key]) {
            associatedCounts[key] = {
              barcode: mateBarcode || null,
              productId: mateProductId || null,
              name: mateName,
              product: mate.itemDetails?.product || null,
              count: 0,
              households: new Set(),
            };
          }

          associatedCounts[key].count++;
          associatedCounts[key].households.add(purchaseHousehold);
        });

        userHouseholds.add(purchaseHousehold);
      }

      // Filter associations that appear in at least 10% of baskets (with minimum 3 occurrences)
      const minOccurrences = Math.max(3, Math.ceil(userHouseholds.size * 0.1));
      const topAssociations = Object.values(associatedCounts)
        .filter(assoc => assoc.count >= minOccurrences)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5); // Top 5 per trigger item

      // Convert to recommendation format
      for (const assoc of topAssociations) {
        const key = assoc.barcode || assoc.productId || assoc.name.toLowerCase();
        if (seenProducts.has(key)) continue; // Skip if already recommended

        // Get full product details
        let productData = null;
        if (assoc.barcode) {
          productData = await Product.findOne({ barcode: assoc.barcode }).lean();
        } else if (assoc.productId) {
          productData = await Product.findById(assoc.productId).lean();
        }

        const recommendedProduct = productData || assoc.product || {
          name: assoc.name,
          barcode: assoc.barcode || null,
          brand: null,
          category: null,
          imageUrl: null,
        };

        recommendations.push({
          name: recommendedProduct.name || assoc.name,
          barcode: recommendedProduct.barcode || assoc.barcode || null,
          productId: recommendedProduct._id?.toString() || assoc.productId || null,
          brand: recommendedProduct.brand || null,
          category: recommendedProduct.category || null,
          imageUrl: recommendedProduct.imageUrl || null,
          quantity: '1',
          score: assoc.count,
          reason: `People who buy ${itemName} also buy this (${assoc.count} times)`,
          source: 'global',
        });

        seenProducts.add(key);
      }
    }

    console.log(`[GlobalRecs] Found ${recommendations.length} global recommendations`);
    return recommendations;

  } catch (error) {
    console.error('[GlobalRecs] Error calculating global associations:', error);
    return [];
  }
}
