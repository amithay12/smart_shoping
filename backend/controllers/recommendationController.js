const ChangeHistory = require('../models/ChangeHistory');
const ShoppingList = require('../models/ShoppingList');
const Product = require('../models/Product');
const Household = require('../models/Household');
const mongoose = require('mongoose');

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
 * 5. CRITICAL: Only recommend products with barcodes (real, scannable products)
 * 6. Exclude products already on the current shopping list
 * 7. Return products with full details (barcode, name, etc.)
 * 
 * IMPORTANT: Products without barcodes are filtered out at multiple stages to ensure
 * only real products with barcodes are recommended. This ensures recommendations
 * are for scannable, trackable products that can have prices.
 */
exports.getRecommendations = async (req, res) => {
  try {
    const householdId = req.user.household;

    // Get household to check declined recommendations
    // Only exclude products declined within the last 7 days (temporary break)
    const household = await Household.findById(householdId);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Filter declined recommendations to only include those declined within last 7 days
    const recentDeclined = (household?.declinedRecommendations || []).filter(
      declined => new Date(declined.declinedAt) >= sevenDaysAgo
    );
    
    const declinedBarcodes = new Set(
      recentDeclined.map(declined => declined.barcode)
    );
    
    // Optional: Clean up old declined entries (older than 7 days) to keep database clean
    if (household && household.declinedRecommendations.length > recentDeclined.length) {
      household.declinedRecommendations = recentDeclined;
      await household.save();
    }

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
    const singlePurchaseRecs = []; // Products bought only once (recently)

    for (const [key, stats] of Object.entries(productStats)) {
      // CRITICAL: Only recommend products with barcodes (real products)
      if (!stats.barcode) continue;

      // Sort purchases by date
      const purchases = stats.purchases.sort((a, b) => a.date - b.date);
      const lastPurchase = purchases[purchases.length - 1];
      const daysSinceLastPurchase = (Date.now() - lastPurchase.date) / (1000 * 60 * 60 * 24);

      // Handle single-purchase products (if purchased recently, they might be needed again)
      if (stats.purchaseCount === 1) {
        // Recommend if purchased within last 60 days (might need again)
        if (daysSinceLastPurchase <= 60) {
          // Skip if already on the shopping list
          if (stats.barcode && currentItemBarcodes.has(stats.barcode)) continue;
          if (stats.productId && currentItemProductIds.has(stats.productId)) continue;
          if (currentItemNames.has(stats.name.toLowerCase())) continue;

          singlePurchaseRecs.push({
            key,
            stats,
            mostCommonQuantity: purchases[0].quantity || '1',
            daysSinceLastPurchase,
            lastPurchaseDate: lastPurchase.date,
            reason: 'Recently purchased - might need again',
          });
        }
        continue; // Don't process single purchases in main loop
      }

      // Calculate weighted average interval between purchases
      // Recent purchases are weighted more heavily (exponential decay)
      let totalWeightedDays = 0;
      let totalWeight = 0;
      const now = Date.now();
      
      for (let i = 1; i < purchases.length; i++) {
        const daysBetween = (purchases[i].date - purchases[i - 1].date) / (1000 * 60 * 60 * 24);
        // Weight decreases exponentially with age (more recent = higher weight)
        // Half-life of 90 days: weight = 2^(-daysSincePurchase/90)
        const daysSincePurchase = (now - purchases[i].date) / (1000 * 60 * 60 * 24);
        const weight = Math.pow(2, -daysSincePurchase / 90);
        
        totalWeightedDays += daysBetween * weight;
        totalWeight += weight;
      }

      const averageFrequencyDays = totalWeight > 0 ? totalWeightedDays / totalWeight : 0;

      // Check if we should recommend this product
      // Recommend if: days since last purchase >= average frequency
      if (daysSinceLastPurchase < averageFrequencyDays) continue;

      // Skip if already on the shopping list
      if (stats.barcode && currentItemBarcodes.has(stats.barcode)) continue;
      if (stats.productId && currentItemProductIds.has(stats.productId)) continue;
      if (currentItemNames.has(stats.name.toLowerCase())) continue;
      
      // Skip if user has declined this recommendation
      if (stats.barcode && declinedBarcodes.has(stats.barcode)) continue;

      // Get most common quantity
      const quantityCounts = {};
      purchases.forEach(p => {
        const qty = p.quantity || '1';
        quantityCounts[qty] = (quantityCounts[qty] || 0) + 1;
      });
      const mostCommonQuantity = Object.keys(quantityCounts).reduce((a, b) =>
        quantityCounts[a] > quantityCounts[b] ? a : b
      );

      // Store recommendation data for batch product lookup
      recommendations.push({
        key,
        stats,
        mostCommonQuantity,
        averageFrequencyDays,
        daysSinceLastPurchase,
        lastPurchaseDate: lastPurchase.date,
        priority: 'high', // Normal frequency-based recommendations
      });
    }

    // Add single-purchase recommendations (lower priority, but fill the screen)
    recommendations.push(...singlePurchaseRecs.map(rec => ({
      ...rec,
      averageFrequencyDays: null,
      priority: 'medium',
    })));

    // Batch fetch all product details at once (more efficient)
    // Only fetch products with barcodes - we only want real products
    const barcodesToFetch = new Set();
    
    recommendations.forEach(rec => {
      if (rec.stats.barcode) {
        barcodesToFetch.add(rec.stats.barcode);
      }
    });

    const productMap = new Map();
    if (barcodesToFetch.size > 0) {
      // Only fetch products that have barcodes
      const products = await Product.find({ 
        barcode: { $in: Array.from(barcodesToFetch), $exists: true, $ne: null, $ne: '' }
      }).lean();
      products.forEach(p => {
        if (p.barcode) {
          productMap.set(p.barcode, p);
        }
      });
    }

    // Convert to final recommendation format with product details
    // Only include products with valid barcodes (real products)
    const finalRecommendations = recommendations
      .map(rec => {
        const { key, stats, mostCommonQuantity, averageFrequencyDays, daysSinceLastPurchase, lastPurchaseDate } = rec;
        
        // CRITICAL: Only process products with barcodes
        if (!stats.barcode) return null;
        
        // Get product data from batch fetch
        let productData = null;
        if (stats.barcode) {
          productData = productMap.get(stats.barcode);
        }

        // If product exists in DB, use it; otherwise use data from purchase history
        // But only if it has a barcode
        const recommendedProduct = productData || (stats.barcode ? {
          name: stats.name,
          barcode: stats.barcode,
          brand: stats.product?.brand || null,
          category: stats.product?.category || null,
          imageUrl: stats.product?.imageUrl || null,
        } : null);

        // Double-check: only return if barcode exists
        if (!recommendedProduct || !recommendedProduct.barcode) return null;

        return {
          name: recommendedProduct.name || stats.name,
          barcode: recommendedProduct.barcode,
          productId: recommendedProduct._id?.toString() || stats.productId || null,
          brand: recommendedProduct.brand || null,
          category: recommendedProduct.category || null,
          imageUrl: recommendedProduct.imageUrl || null,
          quantity: mostCommonQuantity,
          averageFrequencyDays: averageFrequencyDays ? Math.round(averageFrequencyDays * 10) / 10 : null,
          daysSinceLastPurchase: Math.round(daysSinceLastPurchase * 10) / 10,
          purchaseCount: stats.purchaseCount,
          lastPurchaseDate: lastPurchaseDate,
          reason: averageFrequencyDays 
            ? `Usually buy every ${Math.round(averageFrequencyDays)} days`
            : rec.reason || 'Recently purchased - might need again',
          priority: rec.priority || 'high',
        };
      })
      .filter(Boolean) // Remove any null entries (products without barcodes)
      .filter(rec => rec.barcode); // Final safety check: ensure barcode exists

    // Sort by priority (high first), then days since last purchase (most overdue first)
    finalRecommendations.sort((a, b) => {
      const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
      const aPriority = priorityOrder[a.priority] || 1;
      const bPriority = priorityOrder[b.priority] || 1;
      if (aPriority !== bPriority) return bPriority - aPriority;
      return b.daysSinceLastPurchase - a.daysSinceLastPurchase;
    });

    // --- STEP 2: Global Association Recommendations ---
    // Find products that are frequently bought together with items in user's current list
    let globalRecommendations = [];
    if (currentItems.length > 0) {
      globalRecommendations = await calculateGlobalAssociations(
        currentItems,
        currentItemBarcodes,
        currentItemProductIds,
        currentItemNames,
        declinedBarcodes
      );
    }

    // --- STEP 3: Combine and Deduplicate ---
    // Personal recommendations take priority
    const allRecommendations = [...finalRecommendations];
    const recommendedBarcodes = new Set(finalRecommendations.map(r => r.barcode).filter(Boolean));
    const recommendedProductIds = new Set(finalRecommendations.map(r => r.productId).filter(Boolean));
    const recommendedNames = new Set(finalRecommendations.map(r => r.name.toLowerCase()));

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

    // FINAL SAFETY CHECK: Filter out any products without barcodes and declined recommendations
    // This ensures no products without barcodes slip through and declined items are excluded
    let finalFilteredRecommendations = allRecommendations.filter(rec => 
      rec && rec.barcode && rec.barcode.trim() !== '' && !declinedBarcodes.has(rec.barcode)
    );

    // If we don't have enough recommendations, add popular products as fallback
    const MIN_RECOMMENDATIONS = 5; // Minimum recommendations to show
    if (finalFilteredRecommendations.length < MIN_RECOMMENDATIONS) {
      const popularRecs = await getPopularProducts(
        householdId,
        finalFilteredRecommendations,
        currentItemBarcodes,
        currentItemProductIds,
        currentItemNames,
        MIN_RECOMMENDATIONS - finalFilteredRecommendations.length,
        declinedBarcodes
      );
      
      // Add popular recommendations with lower priority
      finalFilteredRecommendations = [...finalFilteredRecommendations, ...popularRecs];
    }

    res.status(200).json({
      recommendations: finalFilteredRecommendations,
      count: finalFilteredRecommendations.length,
      message: finalFilteredRecommendations.length > 0
        ? `Found ${finalFilteredRecommendations.length} recommendation${finalFilteredRecommendations.length > 1 ? 's' : ''} for you`
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
 * 
 * IMPROVED VERSION: Uses MongoDB aggregation pipeline instead of N+1 queries
 * Performance improvement: From O(n*m) queries to O(n) queries where n=trigger items
 * 
 * IMPORTANT: Only returns products with barcodes (real, scannable products).
 * Products without barcodes are filtered out at multiple stages to ensure
 * only trackable products that can have prices are recommended.
 */
async function calculateGlobalAssociations(currentItems, currentItemBarcodes, currentItemProductIds, currentItemNames, declinedBarcodes = new Set()) {
  try {
    console.log('[GlobalRecs] Starting global association calculation...');

    const recommendations = [];
    const seenProducts = new Set(); // Track products we've already recommended
    const TRIGGER_ITEM_LIMIT = 10; // Limit to first 10 items for performance
    const TIME_WINDOW_DAYS = 3; // Look for items bought within 3 days
    const MIN_PURCHASES = 2; // Lowered from 3 to 2 - more associations found
    const MIN_OCCURRENCE_PERCENT = 0.05; // Lowered from 10% to 5% - more recommendations

    // Process trigger items in parallel batches
    const triggerItems = currentItems
      .slice(0, TRIGGER_ITEM_LIMIT)
      .filter(item => item.barcode || item.product);

    // Process each trigger item
    for (const currentItem of triggerItems) {
      const itemBarcode = currentItem.barcode;
      const itemProductId = currentItem.product?.toString();
      const itemName = currentItem.name;

      if (!itemBarcode && !itemProductId) continue;

      try {
        // Step 1: Find all purchases of this trigger product
        const matchingPurchases = await ChangeHistory.aggregate([
          {
            $match: {
              action: 'PURCHASE_ITEM',
              $or: [
                ...(itemBarcode ? [{ 'itemDetails.barcode': itemBarcode }] : []),
                ...(itemProductId ? [{ 'itemDetails.product': itemProductId }] : []),
              ],
            },
          },
          { $sort: { createdAt: -1 } },
          { $limit: 100 },
          {
            $project: {
              household: 1,
              createdAt: 1,
              purchaseDate: '$createdAt',
            },
          },
        ]);

        if (matchingPurchases.length < MIN_PURCHASES) continue;

        const uniqueHouseholdsSet = new Set(matchingPurchases.map(p => p.household.toString()));
        const uniqueHouseholds = uniqueHouseholdsSet.size;

        // Step 2: Build time windows for each matching purchase
        const timeWindowMs = TIME_WINDOW_DAYS * 24 * 60 * 60 * 1000;
        const purchaseTimeWindows = matchingPurchases.map(p => ({
          household: p.household,
          start: new Date(p.createdAt.getTime() - timeWindowMs),
          end: new Date(p.createdAt.getTime() + timeWindowMs),
        }));

        // Step 3: Find all purchases in the same households within time windows
        // This is much more efficient than querying for each purchase individually
        const householdIds = Array.from(uniqueHouseholdsSet).map(id => 
          mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id
        );
        
        const allBasketPurchases = await ChangeHistory.find({
          action: 'PURCHASE_ITEM',
          household: { $in: householdIds },
          'itemDetails.name': { $exists: true, $ne: null, $ne: '' },
          // Exclude the trigger product itself
          $and: [
            ...(itemBarcode ? [{ 'itemDetails.barcode': { $ne: itemBarcode } }] : []),
            ...(itemProductId ? [{ 'itemDetails.product': { $ne: itemProductId } }] : []),
          ],
        })
          .populate('itemDetails.product', 'name brand barcode category imageUrl')
          .lean();

        // Step 4: Filter purchases within time windows and group by product
        const associatedCounts = {};
        const householdPurchaseMap = new Map();

        // Build a map of purchases by household for quick lookup
        purchaseTimeWindows.forEach(window => {
          if (!householdPurchaseMap.has(window.household.toString())) {
            householdPurchaseMap.set(window.household.toString(), []);
          }
          householdPurchaseMap.get(window.household.toString()).push(window);
        });

        allBasketPurchases.forEach(purchase => {
          const purchaseHousehold = purchase.household.toString();
          const purchaseDate = new Date(purchase.createdAt);
          
          // Check if this purchase is within any time window for this household
          const windows = householdPurchaseMap.get(purchaseHousehold) || [];
          const isInTimeWindow = windows.some(window => 
            purchaseDate >= window.start && purchaseDate <= window.end
          );

          if (!isInTimeWindow) return;

          const itemDetails = purchase.itemDetails || {};
          const product = itemDetails.product;
          const mateBarcode = itemDetails.barcode || (product && product.barcode);
          const mateProductId = itemDetails.product?._id?.toString() || (product && product._id?.toString());
          const mateName = itemDetails.name?.trim() || (product && product.name) || '';

          if (!mateName) return;

          // CRITICAL: Only include products with barcodes (real products)
          // Skip products without barcodes - we only want real, scannable products
          if (!mateBarcode) return;

          // Skip if already on user's list
          if (mateBarcode && currentItemBarcodes.has(mateBarcode)) return;
          if (mateProductId && currentItemProductIds.has(mateProductId)) return;
          if (currentItemNames.has(mateName.toLowerCase())) return;
          
          // Skip if user has declined this recommendation
          if (mateBarcode && declinedBarcodes.has(mateBarcode)) return;

          // Use barcode as key if available, otherwise product ID, otherwise name
          const key = mateBarcode || mateProductId || mateName.toLowerCase();

          if (!associatedCounts[key]) {
            associatedCounts[key] = {
              barcode: mateBarcode || null,
              productId: mateProductId || null,
              name: mateName,
              product: product || null,
              count: 0,
              households: new Set(),
            };
          }

          associatedCounts[key].count++;
          associatedCounts[key].households.add(purchaseHousehold);
        });

        // Step 5: Filter and rank associations
        // CRITICAL: Only include products with barcodes (real products)
        const minOccurrences = Math.max(MIN_PURCHASES, Math.ceil(uniqueHouseholds * MIN_OCCURRENCE_PERCENT));
        const topAssociations = Object.values(associatedCounts)
          .filter(assoc => assoc.barcode && assoc.count >= minOccurrences) // Only products with barcodes
          .sort((a, b) => b.count - a.count)
          .slice(0, 5); // Top 5 per trigger item

        const associatedProducts = topAssociations;

        // Batch fetch product details for all associations to avoid N+1 queries
        // Only fetch products with barcodes - we only want real products
        const barcodesToFetch = [];
        
        for (const assoc of associatedProducts) {
          // Only include products with barcodes
          if (assoc.barcode) {
            barcodesToFetch.push(assoc.barcode);
          }
        }

        // Batch fetch products - only those with barcodes
        const fetchedProducts = new Map();
        if (barcodesToFetch.length > 0) {
          const productsByBarcode = await Product.find({ 
            barcode: { $in: barcodesToFetch, $exists: true, $ne: null, $ne: '' }
          }).lean();
          productsByBarcode.forEach(p => {
            if (p.barcode) {
              fetchedProducts.set(p.barcode, p);
            }
          });
        }

        // Convert to recommendation format
        // Only include products with valid barcodes (real products)
        for (const assoc of associatedProducts) {
          // CRITICAL: Skip products without barcodes
          if (!assoc.barcode) continue;

          const key = assoc.barcode;
          if (seenProducts.has(key)) continue;

          // Skip if already on user's list
          if (assoc.barcode && currentItemBarcodes.has(assoc.barcode)) continue;
          if (assoc.productId && currentItemProductIds.has(assoc.productId)) continue;
          if (assoc.name && currentItemNames.has(assoc.name.toLowerCase())) continue;
          
          // Skip if user has declined this recommendation
          if (assoc.barcode && declinedBarcodes.has(assoc.barcode)) continue;

          // Get full product details (from batch fetch)
          let productData = null;
          if (assoc.barcode) {
            productData = fetchedProducts.get(assoc.barcode);
          }

          const recommendedProduct = productData || (assoc.barcode ? {
            name: assoc.name,
            barcode: assoc.barcode,
            brand: assoc.product?.brand || null,
            category: assoc.product?.category || null,
            imageUrl: assoc.product?.imageUrl || null,
          } : null);

          // Double-check: only add if barcode exists
          if (!recommendedProduct || !recommendedProduct.barcode) continue;

          // Calculate confidence score (normalized between 0-100)
          const assocHouseholdCount = assoc.households?.size || 1;
          const confidenceScore = Math.min(100, Math.round((assoc.count / assocHouseholdCount) * 100));

          recommendations.push({
            name: recommendedProduct.name || assoc.name,
            barcode: recommendedProduct.barcode,
            productId: recommendedProduct._id?.toString() || assoc.productId || null,
            brand: recommendedProduct.brand || null,
            category: recommendedProduct.category || null,
            imageUrl: recommendedProduct.imageUrl || null,
            quantity: '1',
            score: assoc.count,
            confidence: confidenceScore,
            reason: `People who buy ${itemName} also buy this (${assoc.count}×, ${confidenceScore}% confidence)`,
            source: 'global',
          });

          seenProducts.add(key);
        }
      } catch (itemError) {
        console.error(`[GlobalRecs] Error processing trigger item ${itemName}:`, itemError);
        // Continue with next item
      }
    }

    console.log(`[GlobalRecs] Found ${recommendations.length} global recommendations`);
    return recommendations;

  } catch (error) {
    console.error('[GlobalRecs] Error calculating global associations:', error);
    return [];
  }
}

/**
 * Get popular products as fallback recommendations
 * Finds products that are frequently purchased across all users (with barcodes)
 */
async function getPopularProducts(householdId, existingRecs, currentItemBarcodes, currentItemProductIds, currentItemNames, limit = 10) {
  try {
    console.log(`[PopularRecs] Fetching ${limit} popular products as fallback...`);

    // Get barcodes of products already recommended to avoid duplicates
    const existingBarcodes = new Set(existingRecs.map(r => r.barcode).filter(Boolean));

    // Convert householdId to ObjectId if needed
    let householdObjectId;
    try {
      householdObjectId = mongoose.Types.ObjectId.isValid(householdId) 
        ? new mongoose.Types.ObjectId(householdId) 
        : householdId;
    } catch (e) {
      householdObjectId = householdId;
    }

    // Find most popular products by purchase count (only products with barcodes)
    const popularProducts = await ChangeHistory.aggregate([
      {
        $match: {
          action: 'PURCHASE_ITEM',
          'itemDetails.barcode': { $exists: true, $ne: null, $ne: '' },
          'itemDetails.name': { $exists: true, $ne: null, $ne: '' },
          // Exclude current household's purchases for freshness
          household: { $ne: householdObjectId },
        },
      },
      {
        $group: {
          _id: '$itemDetails.barcode',
          name: { $first: '$itemDetails.name' },
          purchaseCount: { $sum: 1 },
          productId: { $first: '$itemDetails.product' },
          lastPurchased: { $max: '$createdAt' },
        },
      },
      {
        $match: {
          purchaseCount: { $gte: 2 }, // At least 2 purchases to be considered "popular"
        },
      },
      { $sort: { purchaseCount: -1, lastPurchased: -1 } },
      { $limit: limit * 2 }, // Get more to filter out duplicates
    ]);

    // Fetch product details for popular barcodes
    const barcodesToFetch = popularProducts
      .map(p => p._id)
      .filter(barcode => 
        barcode && 
        !existingBarcodes.has(barcode) &&
        !currentItemBarcodes.has(barcode)
      )
      .slice(0, limit);

    if (barcodesToFetch.length === 0) {
      console.log('[PopularRecs] No popular products found');
      return [];
    }

    const products = await Product.find({
      barcode: { $in: barcodesToFetch, $exists: true, $ne: null, $ne: '' }
    }).lean();

    // Match products with their popularity stats
    const productMap = new Map();
    popularProducts.forEach(p => {
      productMap.set(p._id, p);
    });

    const recommendations = products
      .filter(p => p.barcode && !currentItemBarcodes.has(p.barcode) && !declinedBarcodes.has(p.barcode))
      .map(p => {
        const stats = productMap.get(p.barcode);
        if (!stats) return null;

        // Skip if name matches something already on list
        if (currentItemNames.has(p.name.toLowerCase())) return null;

        return {
          name: p.name,
          barcode: p.barcode,
          productId: p._id?.toString() || null,
          brand: p.brand || null,
          category: p.category || null,
          imageUrl: p.imageUrl || null,
          quantity: '1',
          purchaseCount: stats.purchaseCount,
          reason: `Popular item - purchased ${stats.purchaseCount} times by other users`,
          source: 'popular',
          priority: 'low',
        };
      })
      .filter(Boolean)
      .slice(0, limit);

    console.log(`[PopularRecs] Found ${recommendations.length} popular product recommendations`);
    return recommendations;

  } catch (error) {
    console.error('[PopularRecs] Error getting popular products:', error);
    return [];
  }
}

/**
 * @desc    Decline a product recommendation
 * @route   POST /api/recommendations/decline
 * @access  Private
 */
exports.declineRecommendation = async (req, res) => {
  try {
    const householdId = req.user.household;
    const { barcode } = req.body;

    if (!barcode) {
      return res.status(400).json({ message: 'Barcode is required' });
    }

    // Get household
    const household = await Household.findById(householdId);
    if (!household) {
      return res.status(404).json({ message: 'Household not found' });
    }

    // Check if already declined and update the timestamp, or add new entry
    const declinedIndex = household.declinedRecommendations.findIndex(
      declined => declined.barcode === barcode
    );

    if (declinedIndex >= 0) {
      // Update existing decline timestamp (restart 7-day timer)
      household.declinedRecommendations[declinedIndex].declinedAt = new Date();
    } else {
      // Add new declined recommendation
      household.declinedRecommendations.push({
        barcode: barcode,
        declinedAt: new Date(),
      });
    }

    await household.save();

    res.status(200).json({
      message: 'Recommendation declined',
      declined: true,
    });

  } catch (error) {
    console.error('Error declining recommendation:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
