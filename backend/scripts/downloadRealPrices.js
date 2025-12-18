/**
 * Download real prices from Israeli supermarkets
 * Downloads ~500 products from each supermarket and saves to database
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Store = require('../models/Store');
const Product = require('../models/Product');
const StoreProduct = require('../models/StoreProduct');
const realPriceDownloader = require('../services/scrapers/realPriceDownloader');

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
  console.error('❌ MONGO_URI not found in .env file');
  process.exit(1);
}

async function downloadRealPrices() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Download prices from all supermarkets
    const results = await realPriceDownloader.downloadAll(500);

    let totalProducts = 0;
    let totalStoreProducts = 0;

    // Process each supermarket's products
    for (const [supermarketName, products] of Object.entries(results)) {
      if (products.length === 0) {
        console.log(`\n⚠️  No products found for ${supermarketName}`);
        continue;
      }

      console.log(`\n💾 Saving ${products.length} products for ${supermarketName}...`);

      // Get or create store
      let store = await Store.findOne({ chain: supermarketName });
      if (!store) {
        store = await Store.create({
          name: `${supermarketName} - Main Store`,
          chain: supermarketName,
          address: {
            fullAddress: 'Israel',
          },
          location: {
            type: 'Point',
            coordinates: [34.7818, 32.0853], // Default Tel Aviv
          },
          isActive: true,
        });
        console.log(`  ✅ Created store: ${store.name}`);
      }

      // Process each product
      for (const productData of products) {
        try {
          // Get or create product
          let product = await Product.findOne({ barcode: productData.barcode });
          
          if (!product) {
            product = await Product.create({
              barcode: productData.barcode,
              name: productData.name,
              brand: productData.brand || '',
              category: productData.category || '',
              unit: productData.unit || '',
              size: productData.size || '',
              dataSource: 'government',
            });
            totalProducts++;
          } else {
            // Update product info if needed
            if (!product.name || product.name === 'Unknown Product') {
              product.name = productData.name;
              await product.save();
            }
          }

          // Create or update StoreProduct
          await StoreProduct.findOneAndUpdate(
            { product: product._id, store: store._id },
            {
              price: productData.price,
              currency: 'ILS',
              unitPrice: productData.price,
              isAvailable: true,
              inStock: true,
              lastPriceUpdate: new Date(),
              $push: {
                priceHistory: {
                  price: productData.price,
                  date: new Date(),
                },
              },
            },
            { upsert: true, new: true }
          );

          totalStoreProducts++;
        } catch (error) {
          console.error(`  ❌ Error saving product ${productData.barcode}:`, error.message);
        }
      }

      console.log(`  ✅ Saved ${products.length} products for ${supermarketName}`);
    }

    console.log(`\n📊 Summary:`);
    console.log(`   - New products created: ${totalProducts}`);
    console.log(`   - Store products saved: ${totalStoreProducts}`);
    console.log(`   - Supermarkets processed: ${Object.keys(results).length}`);

    await mongoose.disconnect();
    console.log('\n✅ Download complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

downloadRealPrices();

