const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const StoreProduct = require('../models/StoreProduct');
const Store = require('../models/Store');

async function cleanupPrices() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Remove ALL prices from Rami Levy and Yohananof (we don't have real files yet)
    const ramiLevy = await Store.findOne({ chain: 'Rami Levy' });
    const yohananof = await Store.findOne({ chain: 'Yohananof' });

    if (ramiLevy) {
      const deleted = await StoreProduct.deleteMany({ store: ramiLevy._id });
      console.log(`✅ Removed ${deleted.deletedCount} Rami Levy prices (no real data yet)`);
    }

    if (yohananof) {
      const deleted = await StoreProduct.deleteMany({ store: yohananof._id });
      console.log(`✅ Removed ${deleted.deletedCount} Yohananof prices (no real data yet)`);
    }

    // Remove all prices with no store
    const deletedNoStore = await StoreProduct.deleteMany({ store: null });
    console.log(`✅ Removed ${deletedNoStore.deletedCount} prices with no store`);

    // Remove duplicate prices per product/store (keep most recent)
    const products = await Product.find();
    let totalDuplicates = 0;

    for (const product of products) {
      const allPrices = await StoreProduct.find({ product: product._id }).populate('store');
      
      // Group by store
      const byStore = {};
      allPrices.forEach(sp => {
        const storeKey = sp.store?._id?.toString() || 'no-store';
        if (!byStore[storeKey]) byStore[storeKey] = [];
        byStore[storeKey].push(sp);
      });

      // Keep only most recent per store, delete others
      for (const storeKey in byStore) {
        const prices = byStore[storeKey];
        if (prices.length > 1) {
          // Sort by lastPriceUpdate (newest first)
          prices.sort((a, b) => {
            const dateA = a.lastPriceUpdate || new Date(0);
            const dateB = b.lastPriceUpdate || new Date(0);
            return dateB - dateA;
          });
          
          // Keep first, delete rest
          for (let i = 1; i < prices.length; i++) {
            await StoreProduct.findByIdAndDelete(prices[i]._id);
            totalDuplicates++;
          }
        }
      }
    }

    console.log(`✅ Removed ${totalDuplicates} duplicate prices\n`);
    console.log('✅ Cleanup complete!');

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

cleanupPrices();

