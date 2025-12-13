/**
 * Setup Price Comparison Script
 * 
 * This script:
 * 1. Looks up products by barcode
 * 2. Links them to shopping list items
 * 3. Adds sample prices to stores
 * 
 * Usage: node backend/scripts/setupPriceComparison.js
 */

const path = require('path');
// .env is in backend directory
const envPath = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: envPath });
const mongoose = require('mongoose');

// Debug: Check if MONGO_URI is loaded
if (!process.env.MONGO_URI) {
  console.error('❌ MONGO_URI not found in .env file');
  console.error(`   Looking for .env at: ${envPath}`);
  process.exit(1);
}
const Product = require('../models/Product');
const ShoppingList = require('../models/ShoppingList');
const Store = require('../models/Store');
const StoreProduct = require('../models/StoreProduct');
const { lookupBarcode } = require('../services/barcodeService');

const BARCODES_TO_SETUP = [
  { barcode: '7290001201596', name: 'Eggs' },
  { barcode: '7290004131074', name: 'Mehadrin Milk Yield 3%' },
];

async function setupPriceComparison() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Step 1: Lookup and create products
    console.log('\n📦 Step 1: Looking up products by barcode...');
    const products = [];
    
    for (const item of BARCODES_TO_SETUP) {
      console.log(`\n  Looking up: ${item.barcode} (${item.name})`);
      
      // Check if product already exists
      let product = await Product.findOne({ barcode: item.barcode });
      
      if (!product) {
        // Try to lookup from external API
        const lookupResult = await lookupBarcode(item.barcode);
        
        if (lookupResult.success && lookupResult.product) {
          product = await Product.create({
            barcode: item.barcode,
            name: lookupResult.product.name || item.name,
            brand: lookupResult.product.brand || '',
            category: lookupResult.product.category || '',
            imageUrl: lookupResult.product.imageUrl || '',
            dataSource: lookupResult.source || 'manual',
          });
          console.log(`    ✅ Created product: ${product.name}`);
        } else {
          // Create manually if lookup fails
          product = await Product.create({
            barcode: item.barcode,
            name: item.name,
            brand: '',
            category: 'Food',
            dataSource: 'manual',
          });
          console.log(`    ✅ Created product manually: ${product.name}`);
        }
      } else {
        console.log(`    ℹ️  Product already exists: ${product.name}`);
      }
      
      products.push(product);
    }

    // Step 2: Link products to shopping list items
    console.log('\n🔗 Step 2: Linking products to shopping list items...');
    const allLists = await ShoppingList.find({});
    
    for (const list of allLists) {
      let updated = false;
      
      for (const item of list.items) {
        // Find matching product by barcode
        const matchingProduct = products.find(p => 
          item.barcode === p.barcode || item.name.toLowerCase().includes(p.name.toLowerCase())
        );
        
        if (matchingProduct && !item.product) {
          item.product = matchingProduct._id;
          item.barcode = matchingProduct.barcode;
          updated = true;
          console.log(`    ✅ Linked "${item.name}" to product "${matchingProduct.name}"`);
        }
      }
      
      if (updated) {
        await list.save();
        console.log(`    ✅ Updated shopping list for household: ${list.household}`);
      }
    }

    // Step 3: Get stores
    console.log('\n🏪 Step 3: Getting stores...');
    const stores = await Store.find({ isActive: true });
    console.log(`    Found ${stores.length} active stores`);

    if (stores.length === 0) {
      console.log('    ⚠️  No stores found! Run seedStores.js first.');
      return;
    }

    // Step 4: Add prices for products at stores
    console.log('\n💰 Step 4: Adding prices to stores...');
    
    // Sample prices (in ILS - Israeli Shekels)
    const priceRanges = {
      '7290001201596': { min: 12, max: 18 }, // Eggs - 12-18 ILS
      '7290004131074': { min: 8, max: 12 }, // Milk - 8-12 ILS
    };

    for (const product of products) {
      const priceRange = priceRanges[product.barcode] || { min: 10, max: 20 };
      
      for (const store of stores) {
        // Check if price already exists
        const existing = await StoreProduct.findOne({
          product: product._id,
          store: store._id,
        });

        if (!existing) {
          // Generate random price within range (simulating real prices)
          const price = (Math.random() * (priceRange.max - priceRange.min) + priceRange.min).toFixed(2);
          
          await StoreProduct.create({
            product: product._id,
            store: store._id,
            price: parseFloat(price),
            currency: 'ILS',
            isAvailable: true,
            inStock: true,
            lastPriceUpdate: new Date(),
          });
          
          console.log(`    ✅ Added price ${price} ILS for "${product.name}" at ${store.name}`);
        } else {
          console.log(`    ℹ️  Price already exists for "${product.name}" at ${store.name}`);
        }
      }
    }

    console.log('\n✅ Setup complete!');
    console.log('\n📊 Summary:');
    console.log(`   - Products: ${products.length}`);
    console.log(`   - Stores: ${stores.length}`);
    console.log(`   - Prices added: ${products.length * stores.length}`);
    console.log('\n🎯 Next steps:');
    console.log('   1. Restart your backend server');
    console.log('   2. Open the app and go to "Compare Prices" tab');
    console.log('   3. You should now see price comparison options!');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n👋 Database connection closed');
  }
}

// Run the script
setupPriceComparison();

