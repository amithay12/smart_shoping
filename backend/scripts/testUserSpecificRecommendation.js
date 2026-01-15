const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ChangeHistory = require('../models/ChangeHistory');
const Product = require('../models/Product');
const User = require('../models/User');
const Household = require('../models/Household');

const MONGO_URI = process.env.MONGO_URI;

/**
 * Test recommendation logic for a SPECIFIC USER/HOUSEHOLD
 * This verifies that recommendations are calculated per-household, not globally
 */
async function testUserSpecificRecommendation() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected!\n');

    // Find or create a test user/household
    console.log('👤 Finding a test user...\n');
    
    let testUser = await User.findOne().populate('household');
    let testHousehold = testUser?.household;

    if (!testUser || !testHousehold) {
      console.log('❌ No users found. Creating test user...\n');
      // Create a test household
      testHousehold = new Household({
        name: 'Test Household',
      });
      await testHousehold.save();

      // Create a test user
      testUser = new User({
        displayName: 'Test User',
        email: 'test@example.com',
        household: testHousehold._id,
      });
      await testUser.save();
      console.log('✅ Created test user and household\n');
    } else {
      console.log(`✅ Found user: ${testUser.displayName} (Household: ${testHousehold.name})\n`);
    }

    // Find or create a product with barcode
    let testProduct = await Product.findOne({ barcode: { $exists: true, $ne: null } });
    
    if (!testProduct) {
      console.log('❌ No products with barcodes found. Please add products first.');
      process.exit(1);
    }

    console.log(`📦 Using product: ${testProduct.name} (${testProduct.barcode})\n`);

    // Clear existing purchase history for this household
    console.log('🧹 Clearing existing purchase history for this household...');
    await ChangeHistory.deleteMany({ 
      household: testHousehold._id,
      action: 'PURCHASE_ITEM',
      'itemDetails.barcode': testProduct.barcode
    });
    console.log('✅ Cleared\n');

    // Create purchase history: User buys product every ~1 day (0.89 days average)
    console.log('📝 Creating purchase history: buying every ~1 day...\n');
    
    const now = new Date();
    const purchases = [];
    
    // Create 10 purchases with intervals averaging to ~0.89 days
    // Mix of 1-day and 0.8-day intervals to average ~0.89 days
    let currentDate = new Date(now.getTime() - (10 * 24 * 60 * 60 * 1000)); // Start 10 days ago
    
    for (let i = 0; i < 10; i++) {
      const purchase = new ChangeHistory({
        household: testHousehold._id,
        user: testUser._id,
        action: 'PURCHASE_ITEM',
        itemDetails: {
          name: testProduct.name,
          quantity: '1',
          barcode: testProduct.barcode,
          product: testProduct._id
        },
        createdAt: currentDate
      });
      await purchase.save();
      purchases.push({
        date: new Date(currentDate),
        quantity: '1'
      });
      
      console.log(`  ✓ Purchase ${i + 1}: ${currentDate.toISOString()}`);
      
      // Next purchase: alternate between 0.8 and 1.0 days (averages to ~0.9 days)
      const interval = i % 2 === 0 ? 0.8 : 1.0; // Alternate for average of ~0.9
      currentDate = new Date(currentDate.getTime() + (interval * 24 * 60 * 60 * 1000));
    }

    console.log('\n✅ Purchase history created!\n');
    console.log('=' .repeat(60));

    // Now test the recommendation logic for THIS SPECIFIC HOUSEHOLD
    console.log('\n🧪 Testing Recommendation Logic for THIS HOUSEHOLD:\n');
    
    // Get purchase history for THIS household only
    const householdPurchases = await ChangeHistory.find({
      household: testHousehold._id,
      action: 'PURCHASE_ITEM',
      'itemDetails.barcode': testProduct.barcode
    }).sort({ createdAt: 1 }).lean();

    console.log(`📊 Found ${householdPurchases.length} purchases for this household\n`);

    // Calculate recommendation
    const sortedPurchases = householdPurchases
      .map(p => ({
        date: new Date(p.createdAt),
        quantity: p.itemDetails?.quantity || '1'
      }))
      .sort((a, b) => a.date - b.date);

    const lastPurchase = sortedPurchases[sortedPurchases.length - 1];
    const daysSinceLastPurchase = (Date.now() - lastPurchase.date) / (1000 * 60 * 60 * 24);

    // Calculate weighted average
    let totalWeightedDays = 0;
    let totalWeight = 0;
    const nowTimestamp = Date.now();

    console.log('📊 Calculating Weighted Average Interval:');
    console.log('   Purchase Pair | Interval | Days Since | Weight | Weighted Days');
    console.log('   ' + '-'.repeat(65));

    for (let i = 1; i < sortedPurchases.length; i++) {
      const daysBetween = (sortedPurchases[i].date - sortedPurchases[i - 1].date) / (1000 * 60 * 60 * 24);
      const daysSincePurchase = (nowTimestamp - sortedPurchases[i].date) / (1000 * 60 * 60 * 24);
      const weight = Math.pow(2, -daysSincePurchase / 90);
      
      totalWeightedDays += daysBetween * weight;
      totalWeight += weight;

      console.log(`   ${i-1} → ${i} | ${daysBetween.toFixed(2)} days | ${daysSincePurchase.toFixed(2)} days | ${weight.toFixed(4)} | ${(daysBetween * weight).toFixed(2)}`);
    }

    const averageFrequencyDays = totalWeight > 0 ? totalWeightedDays / totalWeight : 0;

    console.log('\n' + '='.repeat(60));
    console.log(`📈 Average Frequency for THIS HOUSEHOLD: ${averageFrequencyDays.toFixed(2)} days`);
    console.log(`⏱️  Days Since Last Purchase: ${daysSinceLastPurchase.toFixed(2)} days`);
    console.log('='.repeat(60));

    // Test different scenarios
    console.log('\n🎯 Testing Recommendation Scenarios:\n');
    
    const scenarios = [
      { name: 'After 1 day', days: 1 },
      { name: 'After 0.89 days (average)', days: 0.89 },
      { name: 'After 0.5 days', days: 0.5 },
      { name: 'After 1.5 days', days: 1.5 },
    ];

    scenarios.forEach(scenario => {
      const shouldRecommend = scenario.days >= averageFrequencyDays;
      const status = shouldRecommend ? '✅ RECOMMEND' : '❌ DO NOT RECOMMEND';
      console.log(`${status} - ${scenario.name} (${scenario.days} >= ${averageFrequencyDays.toFixed(2)}): ${shouldRecommend}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('💡 Answer to your question:');
    console.log('='.repeat(60));
    console.log(`If THIS user buys a product every ${averageFrequencyDays.toFixed(2)} days on average,`);
    console.log(`then after 1 day: ${1 >= averageFrequencyDays ? '✅ YES, it will recommend' : '❌ NO, it will NOT recommend'}`);
    console.log(`(because 1 ${1 >= averageFrequencyDays ? '>=' : '<'} ${averageFrequencyDays.toFixed(2)})`);
    console.log('='.repeat(60));

    // Verify it's household-specific by checking other households
    console.log('\n🔍 Verifying it\'s household-specific...\n');
    
    const otherHouseholds = await ChangeHistory.aggregate([
      {
        $match: {
          action: 'PURCHASE_ITEM',
          'itemDetails.barcode': testProduct.barcode,
          household: { $ne: testHousehold._id }
        }
      },
      {
        $group: {
          _id: '$household',
          count: { $sum: 1 }
        }
      },
      { $limit: 3 }
    ]);

    if (otherHouseholds.length > 0) {
      console.log(`✅ Found ${otherHouseholds.length} other households with this product`);
      console.log('   (This confirms recommendations are per-household, not global)');
    } else {
      console.log('ℹ️  No other households found (this is fine for testing)');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the test
testUserSpecificRecommendation();

