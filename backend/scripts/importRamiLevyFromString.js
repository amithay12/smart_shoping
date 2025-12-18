const path = require('path');
const xml2js = require('xml2js');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreProduct = require('../models/StoreProduct');

// Paste the full Rami Levy XML here (the one with 224 items)
const ramiLevyXML = process.argv[2] || `<!-- Paste Rami Levy XML here -->`;

if (ramiLevyXML.includes('<!-- Paste')) {
  console.error('❌ Please provide Rami Levy XML as argument or paste it in the script');
  console.log('\nUsage: node scripts/importRamiLevyFromString.js "<xml content>"');
  process.exit(1);
}

async function importXML(xmlContent) {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const parser = new xml2js.Parser({
      explicitArray: false,
      mergeAttrs: true,
      trim: true,
      explicitRoot: true,
    });

    console.log('📥 Parsing Rami Levy XML...');
    const parsed = await parser.parseStringPromise(xmlContent);
    
    const root = parsed.Root || parsed.root;
    if (!root) {
      console.error('❌ No root element found');
      process.exit(1);
    }

    let items = [];
    if (root.Items) {
      if (root.Items.Item) {
        items = Array.isArray(root.Items.Item) ? root.Items.Item : [root.Items.Item];
      }
    }

    if (items.length === 0) {
      console.log('⚠️  No items found');
      process.exit(0);
    }

    console.log(`📦 Found ${items.length} products in XML`);

    let store = await Store.findOne({ chain: 'Rami Levy' });
    if (!store) {
      store = await Store.create({
        name: 'רמי לוי - Rami Levy',
        chain: 'Rami Levy',
        address: { fullAddress: 'Israel' },
        location: { type: 'Point', coordinates: [34.7818, 32.0853] },
        isActive: true,
      });
      console.log('✅ Created Rami Levy store');
    }

    let saved = 0;
    let skipped = 0;
    
    for (const item of items) {
      try {
        const barcode = String(item.ItemCode || '').trim();
        const name = String(item.ItemName || '').trim();
        const price = parseFloat(item.ItemPrice || 0);

        if (!barcode || !name || !price || price <= 0) {
          skipped++;
          continue;
        }

        let product = await Product.findOne({ barcode });
        if (!product) {
          product = await Product.create({
            barcode,
            name,
            brand: String(item.ManufacturerName || '').trim(),
            category: '',
            dataSource: 'government',
          });
        }

        let priceUpdateDate = new Date();
        if (item.PriceUpdateDate) {
          const dateStr = String(item.PriceUpdateDate).trim();
          const parsedDate = new Date(dateStr.replace(/(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/, '$1T$2:$3:${4 || "00"}'));
          if (!isNaN(parsedDate.getTime())) {
            priceUpdateDate = parsedDate;
          }
        }

        await StoreProduct.findOneAndUpdate(
          { product: product._id, store: store._id },
          {
            product: product._id,
            store: store._id,
            price,
            currency: 'ILS',
            unitPrice: price,
            isAvailable: true,
            inStock: true,
            lastPriceUpdate: priceUpdateDate,
            $push: {
              priceHistory: {
                price,
                date: priceUpdateDate,
              },
            },
          },
          { upsert: true, new: true }
        );

        saved++;
        if (saved % 50 === 0) {
          console.log(`  Processed ${saved} products...`);
        }
      } catch (error) {
        skipped++;
        continue;
      }
    }

    console.log(`\n✅ Saved ${saved} products for Rami Levy (skipped ${skipped})`);
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

importXML(ramiLevyXML);



