/**
 * Quick script to find popular product barcodes from fake user data
 * Usage: node scripts/findPopularProducts.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;

async function findPopularProducts() {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected!\n');

    const ChangeHistory = mongoose.connection.db.collection('changehistories');

    console.log('📊 Finding most popular product barcodes...\n');

    const results = await ChangeHistory.aggregate([
      {
        $match: {
          action: 'PURCHASE_ITEM',
          'itemDetails.barcode': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$itemDetails.barcode',
          name: { $first: '$itemDetails.name' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]).toArray();

    if (results.length === 0) {
      console.log('❌ No products found with barcodes');
      process.exit(0);
    }

    console.log('🏆 Top 10 Most Purchased Products:\n');
    console.log('Barcode              | Name                          | Purchase Count');
    console.log('─'.repeat(75));
    
    results.forEach((product, index) => {
      const barcode = (product._id || '').padEnd(18);
      const name = (product.name || 'Unknown').substring(0, 28).padEnd(28);
      const count = product.count.toString().padStart(6);
      console.log(`${barcode} | ${name} | ${count}`);
    });

    console.log('\n💡 Tip: Use one of these barcodes to add a product to your shopping list');
    console.log('   Then check the Recommendations screen to see global recommendations!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

findPopularProducts();

