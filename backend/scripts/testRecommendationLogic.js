const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ChangeHistory = require('../models/ChangeHistory');
const Product = require('../models/Product');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI;

/**
 * Test recommendation logic for one product
 * This script simulates the recommendation calculation for a specific product
 */
async function testRecommendationForOneProduct() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected!\n');

    // Find a product with purchase history
    console.log('📊 Finding a product with purchase history...\n');
    
    const purchaseHistory = await ChangeHistory.aggregate([
      {
        $match: {
          action: 'PURCHASE_ITEM',
          'itemDetails.barcode': { $exists: true, $ne: null, $ne: '' },
          'itemDetails.name': { $exists: true, $ne: null, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$itemDetails.barcode',
          name: { $first: '$itemDetails.name' },
          purchaseCount: { $sum: 1 },
          purchases: { $push: { date: '$createdAt', quantity: '$itemDetails.quantity' } },
          household: { $first: '$household' }
        }
      },
      {
        $match: {
          purchaseCount: { $gte: 2 } // Need at least 2 purchases
        }
      },
      { $sort: { purchaseCount: -1 } },
      { $limit: 1 }
    ]);

    if (purchaseHistory.length === 0) {
      console.log('❌ No products found with 2+ purchases. Creating test data...\n');
      
      // Get a user to create test data
      const testUser = await User.findOne();
      if (!testUser) {
        console.log('❌ No users found. Please create a user first.');
        process.exit(1);
      }

      // Find a product with a barcode
      const testProduct = await Product.findOne({ barcode: { $exists: true, $ne: null } });
      if (!testProduct) {
        console.log('❌ No products with barcodes found. Please add products first.');
        process.exit(1);
      }

      console.log(`✅ Using product: ${testProduct.name} (${testProduct.barcode})\n`);
      console.log('📝 Creating test purchase history...\n');

      // Create 3 purchases with different dates (7 days apart)
      const now = new Date();
      const purchases = [];
      
      for (let i = 2; i >= 0; i--) {
        const purchaseDate = new Date(now.getTime() - (i * 7 * 24 * 60 * 60 * 1000));
        const purchase = new ChangeHistory({
          household: testUser.household,
          user: testUser._id,
          action: 'PURCHASE_ITEM',
          itemDetails: {
            name: testProduct.name,
            quantity: '1',
            barcode: testProduct.barcode,
            product: testProduct._id
          },
          createdAt: purchaseDate
        });
        await purchase.save();
        purchases.push({
          date: purchaseDate,
          quantity: '1'
        });
        console.log(`  ✓ Purchase ${i + 1}: ${purchaseDate.toISOString()}`);
      }

      console.log('\n✅ Test purchase history created!\n');
      
      // Test the recommendation logic
      testRecommendationLogic(testProduct, purchases, testUser.household);
    } else {
      const productData = purchaseHistory[0];
      const barcode = productData._id;
      
      console.log(`✅ Found product: ${productData.name} (${barcode})`);
      console.log(`   Purchase count: ${productData.purchaseCount}\n`);

      // Get product details
      const product = await Product.findOne({ barcode });
      
      // Test the recommendation logic
      const purchases = productData.purchases.map(p => ({
        date: new Date(p.date),
        quantity: p.quantity || '1'
      }));

      testRecommendationLogic(product || { name: productData.name, barcode }, purchases, productData.household);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

/**
 * Test the recommendation logic calculation
 */
function testRecommendationLogic(product, purchases, householdId) {
  console.log('🧪 Testing Recommendation Logic\n');
  console.log('='.repeat(60));
  console.log(`Product: ${product.name}`);
  console.log(`Barcode: ${product.barcode || 'N/A'}`);
  console.log(`Purchase Count: ${purchases.length}`);
  console.log('='.repeat(60));
  console.log('\n📅 Purchase History:');
  
  purchases.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.date.toISOString()} (${p.quantity})`);
  });

  // Sort purchases by date
  const sortedPurchases = purchases.sort((a, b) => a.date - b.date);
  const lastPurchase = sortedPurchases[sortedPurchases.length - 1];
  const now = Date.now();
  const daysSinceLastPurchase = (now - lastPurchase.date) / (1000 * 60 * 60 * 24);

  console.log(`\n⏰ Days Since Last Purchase: ${daysSinceLastPurchase.toFixed(2)} days`);
  console.log(`   Last purchase: ${lastPurchase.date.toISOString()}`);
  console.log(`   Now: ${new Date(now).toISOString()}`);

  // Calculate weighted average interval
  let totalWeightedDays = 0;
  let totalWeight = 0;
  
  console.log('\n📊 Calculating Weighted Average Interval:');
  console.log('   Interval | Days Since | Weight | Weighted Days');
  console.log('   ' + '-'.repeat(50));

  for (let i = 1; i < sortedPurchases.length; i++) {
    const daysBetween = (sortedPurchases[i].date - sortedPurchases[i - 1].date) / (1000 * 60 * 60 * 24);
    const daysSincePurchase = (now - sortedPurchases[i].date) / (1000 * 60 * 60 * 24);
    const weight = Math.pow(2, -daysSincePurchase / 90);
    
    totalWeightedDays += daysBetween * weight;
    totalWeight += weight;

    console.log(`   ${daysBetween.toFixed(2)} days | ${daysSincePurchase.toFixed(2)} days | ${weight.toFixed(4)} | ${(daysBetween * weight).toFixed(2)}`);
  }

  const averageFrequencyDays = totalWeight > 0 ? totalWeightedDays / totalWeight : 0;

  console.log('\n' + '='.repeat(60));
  console.log(`📈 Average Frequency: ${averageFrequencyDays.toFixed(2)} days`);
  console.log(`⏱️  Days Since Last Purchase: ${daysSinceLastPurchase.toFixed(2)} days`);
  console.log(`🎯 Threshold Check: daysSinceLastPurchase >= averageFrequencyDays`);
  console.log(`   ${daysSinceLastPurchase.toFixed(2)} >= ${averageFrequencyDays.toFixed(2)}`);
  console.log('='.repeat(60));

  const shouldRecommend = daysSinceLastPurchase >= averageFrequencyDays;
  
  console.log('\n' + (shouldRecommend ? '✅ RECOMMEND' : '❌ DO NOT RECOMMEND'));
  console.log(`\nReason: `);
  if (shouldRecommend) {
    console.log(`   ✓ Days since last purchase (${daysSinceLastPurchase.toFixed(2)} days) >= average frequency (${averageFrequencyDays.toFixed(2)} days)`);
    console.log(`   ✓ Product should appear in recommendations`);
  } else {
    console.log(`   ✗ Days since last purchase (${daysSinceLastPurchase.toFixed(2)} days) < average frequency (${averageFrequencyDays.toFixed(2)} days)`);
    console.log(`   ✗ Need to wait ${(averageFrequencyDays - daysSinceLastPurchase).toFixed(2)} more days`);
    console.log(`   ✗ Product will NOT appear in recommendations yet`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('💡 Summary:');
  console.log(`   - Average interval between purchases: ${averageFrequencyDays.toFixed(2)} days`);
  console.log(`   - Last purchase was: ${daysSinceLastPurchase.toFixed(2)} days ago`);
  console.log(`   - Recommendation: ${shouldRecommend ? 'YES ✅' : 'NO ❌'}`);
  if (!shouldRecommend) {
    const daysToWait = averageFrequencyDays - daysSinceLastPurchase;
    console.log(`   - Wait ${daysToWait.toFixed(2)} more days for recommendation`);
  }
  console.log('='.repeat(60));
}

// Run the test
testRecommendationForOneProduct();

