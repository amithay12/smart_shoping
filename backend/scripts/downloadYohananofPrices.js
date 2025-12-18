const path = require('path');
// .env is in backend folder
const envPath = path.join(__dirname, '..', '.env');
require('dotenv').config({ path: envPath });

// Debug: Check if .env was loaded
if (!process.env.MONGO_URI) {
  console.error(`❌ MONGO_URI not found. Checked: ${envPath}`);
  console.error('   Make sure .env file exists in backend folder with MONGO_URI=mongodb://...');
  process.exit(1);
}
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreProduct = require('../models/StoreProduct');
const RealPriceDownloader = require('../services/scrapers/realPriceDownloader');

async function downloadAndImportYohananof() {
  try {
    if (!process.env.MONGO_URI) {
      console.error('❌ MONGO_URI not found in .env file');
      console.log('   Make sure .env file exists in project root with MONGO_URI set');
      process.exit(1);
    }
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const downloader = RealPriceDownloader;
    
    console.log('📥 Downloading Yohananof price files...');
    console.log('   This may take a few minutes...\n');

    // Download and parse files - limit to reasonable number of products
    const maxProducts = 500; // Get around 500 products (not too many, not too few)
    
    let totalProducts = 0;
    let totalSaved = 0;
    let filesDownloaded = 0;
    const maxFiles = 5; // Try up to 5 files to get enough products

    // Get or create Yohananof store
    let store = await Store.findOne({ chain: 'Yohananof' });
    if (!store) {
      store = await Store.create({
        name: 'יוחננוף - Yohananof',
        chain: 'Yohananof',
        address: {
          fullAddress: 'Israel',
        },
        location: {
          type: 'Point',
          coordinates: [34.7818, 32.0853],
        },
        isActive: true,
      });
      console.log('✅ Created Yohananof store\n');
    }

    // Try downloading multiple files until we have enough products
    for (let attempt = 1; attempt <= maxFiles && totalProducts < maxProducts; attempt++) {
      try {
        console.log(`📥 Attempt ${attempt}/${maxFiles}: Downloading Yohananof file...`);
        
        const fileData = await downloader.downloadPriceFile('Yohananof');
        
        if (!fileData) {
          console.log(`  ⚠️  Could not download file ${attempt}, trying next...\n`);
          continue;
        }

        filesDownloaded++;
        console.log(`  ✅ Downloaded file ${filesDownloaded} (${(fileData.length / 1024).toFixed(2)} KB)`);

        // Decompress if needed
        let xmlData;
        try {
          xmlData = downloader.decompressGZ(fileData);
          console.log(`  📦 Decompressed file`);
        } catch (error) {
          // If not gzipped, use as-is
          xmlData = fileData;
        }

        // Parse XML
        let parsed;
        try {
          parsed = await downloader.parseXML(xmlData);
        } catch (parseError) {
          console.log(`  ⚠️  XML parse error: ${parseError.message.substring(0, 100)}`);
          // Try to see what we got
          const xmlPreview = Buffer.isBuffer(xmlData) ? xmlData.toString('utf-8').substring(0, 200) : String(xmlData).substring(0, 200);
          console.log(`  XML preview: ${xmlPreview}...\n`);
          continue;
        }
        
        const products = downloader.extractProducts(parsed, 'Yohananof');

        if (products.length === 0) {
          console.log(`  ⚠️  No products found in file ${attempt}`);
          // Debug: show XML structure
          if (parsed) {
            const keys = Object.keys(parsed);
            console.log(`  XML root keys: ${keys.join(', ')}\n`);
          } else {
            console.log(`  Parsed XML is null/undefined\n`);
          }
          continue;
        }

        console.log(`  📦 Found ${products.length} products in file`);

        // Save products (limit to not exceed maxProducts)
        const productsToSave = products.slice(0, maxProducts - totalProducts);
        let saved = 0;

        for (const productData of productsToSave) {
          try {
            if (!productData.barcode || !productData.name || !productData.price) {
              continue;
            }

            // Get or create product
            let product = await Product.findOne({ barcode: productData.barcode });
            if (!product) {
              product = await Product.create({
                barcode: productData.barcode,
                name: productData.name,
                brand: productData.brand || '',
                category: productData.category || '',
                dataSource: 'government',
              });
            }

            // Save price
            await StoreProduct.findOneAndUpdate(
              { product: product._id, store: store._id },
              {
                product: product._id,
                store: store._id,
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

            saved++;
            totalProducts++;
          } catch (error) {
            // Skip duplicates or errors
            continue;
          }
        }

        totalSaved += saved;
        console.log(`  ✅ Saved ${saved} products from file ${attempt}`);
        console.log(`  📊 Total so far: ${totalProducts} products\n`);

        // If we have enough products, stop
        if (totalProducts >= maxProducts) {
          console.log(`✅ Reached target of ${maxProducts} products!\n`);
          break;
        }

        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.log(`  ❌ Error on attempt ${attempt}: ${error.message}\n`);
        continue;
      }
    }

    console.log('📊 Summary:');
    console.log(`   - Files downloaded: ${filesDownloaded}`);
    console.log(`   - Products imported: ${totalSaved}`);
    console.log(`   - Total products in database: ${totalProducts}\n`);

    if (totalSaved > 0) {
      console.log('✅ Yohananof prices imported successfully!');
      console.log('   Products are now available in barcode search and price comparison.\n');
    } else {
      console.log('⚠️  No products were imported. Check the download process.\n');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

downloadAndImportYohananof();

