const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ChangeHistory = require('../models/ChangeHistory');
const Product = require('../models/Product');
const User = require('../models/User');
const Household = require('../models/Household');

const MONGO_URI = process.env.MONGO_URI;

/**
 * Make a product appear in recommendations immediately by adjusting last purchase date
 */
async function makeProductRecommendedNow() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected!\n');

    const barcode = '7290011194246';
    const productName = 'קוטג\' 5%, 250 גרם';

    // Find user
    const testUser = await User.findOne().populate('household');
    if (!testUser || !testUser.household) {
      console.log('❌ No user found.');
      process.exit(1);
    }

    // Find the most recent purchase for this product
    const lastPurchase = await ChangeHistory.findOne({
      household: testUser.household._id,
      action: 'PURCHASE_ITEM',
      'itemDetails.barcode': barcode
    }).sort({ createdAt: -1 });

    if (!lastPurchase) {
      console.log(`❌ No purchase found for ${productName}`);
      process.exit(1);
    }

    // Get all purchases to calculate average interval
    const allPurchases = await ChangeHistory.find({
      household: testUser.household._id,
      action: 'PURCHASE_ITEM',
      'itemDetails.barcode': barcode
    }).sort({ createdAt: 1 });

    if (allPurchases.length < 2) {
      console.log('❌ Need at least 2 purchases to calculate average interval');
      process.exit(1);
    }

    // Calculate average interval
    let totalDays = 0;
    for (let i = 1; i < allPurchases.length; i++) {
      const daysBetween = (allPurchases[i].createdAt - allPurchases[i - 1].createdAt) / (1000 * 60 * 60 * 24);
      totalDays += daysBetween;
    }
    const averageInterval = totalDays / (allPurchases.length - 1);

    console.log(`📊 Current stats:`);
    console.log(`   Product: ${productName}`);
    console.log(`   Total purchases: ${allPurchases.length}`);
    console.log(`   Average interval: ${averageInterval.toFixed(2)} days`);
    console.log(`   Last purchase: ${lastPurchase.createdAt.toISOString().split('T')[0]}`);

    const daysSinceLastPurchase = (Date.now() - lastPurchase.createdAt) / (1000 * 60 * 60 * 24);
    console.log(`   Days since last purchase: ${daysSinceLastPurchase.toFixed(2)} days\n`);

    if (daysSinceLastPurchase >= averageInterval) {
      console.log('✅ Product should already appear in recommendations!');
      process.exit(0);
    }

    // Update last purchase date to make it old enough
    const neededDaysAgo = averageInterval + 0.5; // Add 0.5 days buffer
    const newDate = new Date(Date.now() - (neededDaysAgo * 24 * 60 * 60 * 1000));

    console.log(`📅 Updating last purchase date...`);
    console.log(`   Old date: ${lastPurchase.createdAt.toISOString()}`);
    console.log(`   New date: ${newDate.toISOString()}\n`);

    lastPurchase.createdAt = newDate;
    await lastPurchase.save();

    const newDaysSince = (Date.now() - newDate) / (1000 * 60 * 60 * 24);
    console.log('='.repeat(60));
    console.log('✅ Updated!');
    console.log(`   New days since last purchase: ${newDaysSince.toFixed(2)} days`);
    console.log(`   Average interval: ${averageInterval.toFixed(2)} days`);
    console.log(`   ${newDaysSince >= averageInterval ? '✅' : '❌'} Should appear in recommendations NOW!`);
    console.log('='.repeat(60));
    console.log('\n✅ Check your recommendations screen - it should appear now!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

makeProductRecommendedNow();

