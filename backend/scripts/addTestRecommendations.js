const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ChangeHistory = require('../models/ChangeHistory');
const Product = require('../models/Product');
const User = require('../models/User');
const Household = require('../models/Household');

const MONGO_URI = process.env.MONGO_URI;

/**
 * Add test purchase history to generate recommendations
 * Creates purchase history for multiple products with different intervals
 */
async function addTestRecommendations() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected!\n');

    // Find user (you can modify this to find a specific user)
    const testUser = await User.findOne().populate('household');
    if (!testUser || !testUser.household) {
      console.log('❌ No user found. Please create a user first.');
      process.exit(1);
    }

    console.log(`👤 Found user: ${testUser.email || testUser.displayName}`);
    console.log(`   Household: ${testUser.household.name}\n`);

    // Find products with barcodes from the database
    console.log('📦 Finding products with barcodes...\n');
    const products = await Product.find({ 
      barcode: { $exists: true, $ne: null, $ne: '' } 
    }).limit(15).lean();

    if (products.length === 0) {
      console.log('❌ No products with barcodes found. Please add products first.');
      process.exit(1);
    }

    console.log(`✅ Found ${products.length} products with barcodes\n`);

    // Check existing purchase history for this household
    const existingPurchases = await ChangeHistory.find({
      household: testUser.household._id,
      action: 'PURCHASE_ITEM',
    }).countDocuments();

    console.log(`📊 Current purchase history: ${existingPurchases} purchases\n`);

    // Clear existing test purchases if needed (optional - comment out if you want to keep existing)
    // await ChangeHistory.deleteMany({
    //   household: testUser.household._id,
    //   action: 'PURCHASE_ITEM',
    // });

    // Purchase patterns for different products
    // Format: { daysInterval: X, purchaseCount: Y }
    // This will create purchases spaced by X days, Y times
    const purchasePatterns = [
      { daysInterval: 3, purchaseCount: 5 },  // Buy every 3 days (milk, bread)
      { daysInterval: 7, purchaseCount: 6 },  // Buy every week (weekly groceries)
      { daysInterval: 14, purchaseCount: 4 }, // Buy every 2 weeks
      { daysInterval: 5, purchaseCount: 5 },  // Buy every 5 days
      { daysInterval: 10, purchaseCount: 4 }, // Buy every 10 days
      { daysInterval: 4, purchaseCount: 5 },  // Buy every 4 days
      { daysInterval: 6, purchaseCount: 5 },  // Buy every 6 days
      { daysInterval: 8, purchaseCount: 4 },  // Buy every 8 days
    ];

    console.log('📝 Creating purchase history...\n');
    console.log('   Product | Interval | Purchases | Dates');
    console.log('   ' + '-'.repeat(60));

    const now = new Date();
    let purchaseCount = 0;
    const productsToUse = products.slice(0, Math.min(products.length, purchasePatterns.length));

    for (let i = 0; i < productsToUse.length; i++) {
      const product = productsToUse[i];
      const pattern = purchasePatterns[i % purchasePatterns.length];
      
      // Start from the past and work forward
      let purchaseDate = new Date(now.getTime() - (pattern.daysInterval * pattern.purchaseCount * 24 * 60 * 60 * 1000));
      
      const purchaseDates = [];
      
      for (let j = 0; j < pattern.purchaseCount; j++) {
        // Add some randomness to intervals (±20%)
        const randomVariation = (Math.random() - 0.5) * 0.4; // -0.2 to +0.2
        const actualInterval = pattern.daysInterval * (1 + randomVariation);
        
        const purchase = new ChangeHistory({
          household: testUser.household._id,
          user: testUser._id,
          action: 'PURCHASE_ITEM',
          itemDetails: {
            name: product.name,
            quantity: '1',
            barcode: product.barcode,
            product: product._id
          },
          createdAt: purchaseDate
        });
        
        await purchase.save();
        purchaseDates.push(purchaseDate.toISOString().split('T')[0]);
        purchaseCount++;
        
        // Move to next purchase date
        purchaseDate = new Date(purchaseDate.getTime() + (actualInterval * 24 * 60 * 60 * 1000));
      }

      console.log(`   ${product.name.substring(0, 20).padEnd(20)} | ${pattern.daysInterval} days | ${pattern.purchaseCount}x | ${purchaseDates[0]} ... ${purchaseDates[purchaseDates.length - 1]}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Created ${purchaseCount} purchase records`);
    console.log('='.repeat(60));

    // Calculate how many recommendations this should generate
    console.log('\n💡 Expected Results:');
    console.log('   - Products with 5+ purchases: Should appear as recommendations');
    console.log('   - Products where daysSinceLastPurchase >= averageInterval: Will be recommended');
    console.log('   - Check your Recommendations screen in ~1-2 minutes\n');

    // Show products that should be recommended soon
    const productsWithHistory = await ChangeHistory.aggregate([
      {
        $match: {
          household: testUser.household._id,
          action: 'PURCHASE_ITEM',
          'itemDetails.barcode': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$itemDetails.barcode',
          name: { $first: '$itemDetails.name' },
          purchaseCount: { $sum: 1 },
          lastPurchase: { $max: '$createdAt' },
          firstPurchase: { $min: '$createdAt' }
        }
      },
      {
        $match: {
          purchaseCount: { $gte: 2 } // Need at least 2 purchases
        }
      },
      { $sort: { purchaseCount: -1 } }
    ]);

    console.log(`📊 Products with purchase history (${productsWithHistory.length}):`);
    productsWithHistory.forEach((item, index) => {
      const daysSinceLastPurchase = (Date.now() - new Date(item.lastPurchase).getTime()) / (1000 * 60 * 60 * 24);
      const totalDays = (new Date(item.lastPurchase) - new Date(item.firstPurchase)) / (1000 * 60 * 60 * 24);
      const avgInterval = totalDays / (item.purchaseCount - 1);
      const shouldRecommend = daysSinceLastPurchase >= avgInterval;
      
      console.log(`   ${index + 1}. ${item.name.substring(0, 30).padEnd(30)} | ${item.purchaseCount} purchases | ${avgInterval.toFixed(1)} day avg | ${daysSinceLastPurchase.toFixed(1)} days ago | ${shouldRecommend ? '✅ Should recommend' : '⏳ Not yet'}`);
    });

    console.log('\n✅ Done! Check your recommendations screen.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
addTestRecommendations();

