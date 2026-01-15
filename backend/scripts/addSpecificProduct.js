const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ChangeHistory = require('../models/ChangeHistory');
const Product = require('../models/Product');
const User = require('../models/User');
const Household = require('../models/Household');

const MONGO_URI = process.env.MONGO_URI;

/**
 * Add a specific product to the database and create purchase history
 */
async function addSpecificProduct() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected!\n');

    // Find user
    const testUser = await User.findOne().populate('household');
    if (!testUser || !testUser.household) {
      console.log('❌ No user found. Please create a user first.');
      process.exit(1);
    }

    console.log(`👤 Found user: ${testUser.email || testUser.displayName}`);
    console.log(`   Household: ${testUser.household.name}\n`);

    // Product to add
    const productData = {
      barcode: '7290011194246',
      name: 'קוטג\' 5%, 250 גרם',
      category: 'Dairy',
      dataSource: 'manual'
    };

    console.log(`📦 Adding product: ${productData.name} (${productData.barcode})\n`);

    // Check if product already exists
    let product = await Product.findOne({ barcode: productData.barcode });
    
    if (product) {
      console.log('✅ Product already exists in database');
    } else {
      // Create new product
      product = new Product(productData);
      await product.save();
      console.log('✅ Product created in database');
    }

    // Clear existing purchase history for this product (optional - to start fresh)
    const existingPurchases = await ChangeHistory.countDocuments({
      household: testUser.household._id,
      action: 'PURCHASE_ITEM',
      'itemDetails.barcode': productData.barcode
    });

    if (existingPurchases > 0) {
      console.log(`\n📊 Found ${existingPurchases} existing purchases for this product`);
      console.log('   (Keeping existing purchases and adding more...)');
    }

    // Create purchase history: Buy every 3-4 days (common for cottage cheese)
    const purchaseCount = 8; // 8 purchases to get good average
    const baseInterval = 3.5; // Average 3.5 days
    const now = new Date();

    console.log(`\n📝 Creating ${purchaseCount} purchase records...`);
    console.log('   (Buying every ~3-4 days on average)\n');

    // Start from the past, but make sure last purchase is old enough to trigger recommendation
    // We want daysSinceLastPurchase >= averageInterval, so we'll make last purchase 
    // at least (baseInterval + 1) days ago to ensure it shows up
    const targetDaysSinceLastPurchase = baseInterval + 1; // 4.5 days ago
    const startDate = new Date(now.getTime() - ((baseInterval * (purchaseCount - 1) + targetDaysSinceLastPurchase) * 24 * 60 * 60 * 1000));
    let purchaseDate = startDate;
    const purchaseDates = [];

    for (let i = 0; i < purchaseCount; i++) {
      // Add some randomness to intervals (±1 day)
      const randomVariation = (Math.random() - 0.5) * 2; // -1 to +1 days
      const actualInterval = baseInterval + randomVariation;

      const purchase = new ChangeHistory({
        household: testUser.household._id,
        user: testUser._id,
        action: 'PURCHASE_ITEM',
        itemDetails: {
          name: productData.name,
          quantity: '1',
          barcode: productData.barcode,
          product: product._id
        },
        createdAt: purchaseDate
      });

      await purchase.save();
      purchaseDates.push(purchaseDate.toISOString().split('T')[0]);
      
      console.log(`   ✓ Purchase ${i + 1}: ${purchaseDate.toISOString().split('T')[0]}`);

      // Move to next purchase date
      purchaseDate = new Date(purchaseDate.getTime() + (actualInterval * 24 * 60 * 60 * 1000));
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ Created ${purchaseCount} purchase records`);
    console.log(`   Product: ${productData.name}`);
    console.log(`   Barcode: ${productData.barcode}`);
    console.log(`   Date range: ${purchaseDates[0]} to ${purchaseDates[purchaseDates.length - 1]}`);
    console.log('='.repeat(60));

    // Calculate expected recommendation
    // Last purchase date is already set from the loop, calculate days since
    const lastPurchaseDate = purchaseDates[purchaseDates.length - 1];
    const daysSinceLastPurchase = (Date.now() - new Date(lastPurchaseDate).getTime()) / (1000 * 60 * 60 * 24);
    const averageFrequencyDays = baseInterval;

    console.log('\n💡 Expected Results:');
    console.log(`   - Average frequency: ~${averageFrequencyDays.toFixed(1)} days`);
    console.log(`   - Days since last purchase: ~${daysSinceLastPurchase.toFixed(1)} days`);
    
    if (daysSinceLastPurchase >= averageFrequencyDays) {
      console.log(`   ✅ Should appear in recommendations NOW!`);
    } else {
      const daysToWait = averageFrequencyDays - daysSinceLastPurchase;
      console.log(`   ⏳ Will appear in recommendations in ~${daysToWait.toFixed(1)} days`);
    }

    console.log('\n✅ Done! Check your recommendations screen.\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run the script
addSpecificProduct();

