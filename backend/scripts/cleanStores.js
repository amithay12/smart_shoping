/**
 * Clean up stores - remove fake stores, keep only real supermarkets
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI not found in .env file');
  process.exit(1);
}
const mongoose = require('mongoose');
const Store = require('../models/Store');
const StoreProduct = require('../models/StoreProduct');

async function cleanStores() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Real supermarket chains
    const realChains = ['Shufersal', 'Rami Levy', 'Yohananof'];

    // Delete all stores that are not real chains
    const result = await Store.deleteMany({
      chain: { $nin: realChains }
    });
    console.log(`🗑️  Deleted ${result.deletedCount} fake/incorrect stores`);

    // Delete all store products for deleted stores
    const deletedStores = await Store.find({ chain: { $nin: realChains } });
    const deletedStoreIds = deletedStores.map(s => s._id);
    
    if (deletedStoreIds.length > 0) {
      const deletedProducts = await StoreProduct.deleteMany({
        store: { $in: deletedStoreIds }
      });
      console.log(`🗑️  Deleted ${deletedProducts.deletedCount} store products`);
    }

    // List remaining stores
    const remainingStores = await Store.find();
    console.log(`\n✅ Remaining stores (${remainingStores.length}):`);
    remainingStores.forEach(store => {
      console.log(`   - ${store.name} (${store.chain})`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Cleanup complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

cleanStores();

