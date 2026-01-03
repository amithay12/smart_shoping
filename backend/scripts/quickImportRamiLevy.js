const path = require('path');
const fs = require('fs');
const xml2js = require('xml2js');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreProduct = require('../models/StoreProduct');

// Read the full Rami Levy XML from the file you provided
// The XML should be saved to: backend/data/rami_levy_full.xml
const xmlFilePath = path.join(__dirname, '..', 'data', 'rami_levy_full.xml');

if (!fs.existsSync(xmlFilePath)) {
  console.error('❌ Rami Levy XML file not found!');
  console.log('\n📝 Instructions:');
  console.log('1. Save your complete Rami Levy XML to: backend/data/rami_levy_full.xml');
  console.log('2. Run this script again: node scripts/quickImportRamiLevy.js\n');
  process.exit(1);
}

const xmlContent = fs.readFileSync(xmlFilePath, 'utf-8');

async function importRamiLevy() {
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

    console.log(`📦 Found ${items.length} products in XML\n`);

    let store = await Store.findOne({ chain: 'Rami Levy' });
    if (!store) {
      store = await Store.create({
        name: 'רמי לוי - Rami Levy',
        chain: 'Rami Levy',
        address: { fullAddress: 'Israel' },
        location: { type: 'Point', coordinates: [34.7818, 32.0853] },
        isActive: true,
      });
      console.log('✅ Created Rami Levy store\n');
    }

    let saved = 0;
    let skipped = 0;
    let errors = 0;
    
    console.log('💾 Saving products...');
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
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
          // Handle formats: "2024-12-02 18:15:07" or "2025-12-17 09:48"
          const dateMatch = dateStr.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
          if (dateMatch) {
            const [, date, hour, min, sec = '00'] = dateMatch;
            const parsedDate = new Date(`${date}T${hour}:${min}:${sec}`);
            if (!isNaN(parsedDate.getTime())) {
              priceUpdateDate = parsedDate;
            }
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
        if (saved % 25 === 0) {
          process.stdout.write(`\r  Progress: ${saved}/${items.length} products saved...`);
        }
      } catch (error) {
        errors++;
        continue;
      }
    }

    console.log(`\n\n✅ Import complete!`);
    console.log(`   - Saved: ${saved} products`);
    console.log(`   - Skipped: ${skipped} (invalid data)`);
    console.log(`   - Errors: ${errors}`);
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

importRamiLevy();














