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

    res.status(200).json({
      recommendations: recommendations,
      count: recommendations.length,
      message: recommendations.length > 0
        ? `Found ${recommendations.length} product${recommendations.length > 1 ? 's' : ''} you usually buy`
        : 'Keep shopping to get personalized recommendations!'
    });

  } catch (error) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
