/**
 * Test Script for Real Data Scrapers
 * Tests all scrapers with real Israeli product barcodes
 */

require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const scraperManager = require('../services/scrapers/scraperManager');
const governmentPriceService = require('../services/scrapers/governmentPriceService');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

// Common Israeli product barcodes for testing
const testBarcodes = [
  '7290000064228', // Common Israeli product
  '7290014065077', // Another common product
  '7290000064228', // Coca Cola Israel
];

async function testScrapers() {
  try {
    await connectDB();

    console.log('🧪 Testing Real Data Scrapers\n');
    console.log('='.repeat(50));

    // Test 1: Government Price Service
    console.log('\n1. Testing Government Price Service...');
    const govResults = await governmentPriceService.searchByBarcode(testBarcodes[0]);
    console.log(`   Found products in ${govResults.length} stores`);
    govResults.forEach(result => {
      console.log(`   - ${result.store}: ${result.product.name} - ₪${result.product.price}`);
    });

    // Test 2: Individual Scrapers
    console.log('\n2. Testing Individual Scrapers...');
    for (const [storeName, scraper] of Object.entries(scraperManager.scrapers)) {
      console.log(`\n   Testing ${storeName}...`);
      try {
        const product = await scraper.searchByBarcode(testBarcodes[0]);
        if (product) {
          console.log(`   ✅ Found: ${product.name} - ₪${product.price}`);
        } else {
          console.log(`   ⚠️  Product not found`);
        }
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Test 3: Search Across All Stores
    console.log('\n3. Testing Search Across All Stores...');
    const allResults = await scraperManager.searchProductAcrossStores(testBarcodes[0]);
    console.log(`   Found in ${allResults.length} stores:`);
    allResults.forEach(result => {
      console.log(`   - ${result.storeName}: ${result.name} - ₪${result.price}`);
    });

    // Test 4: Store Locations
    console.log('\n4. Testing Store Locations...');
    for (const [storeName, scraper] of Object.entries(scraperManager.scrapers)) {
      try {
        const locations = await scraper.getStoreLocations();
        console.log(`   ${storeName}: ${locations.length} stores found`);
        if (locations.length > 0) {
          console.log(`     Example: ${locations[0].name} - ${locations[0].address.city}`);
        }
      } catch (error) {
        console.log(`   ${storeName}: Error - ${error.message}`);
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log('✨ Testing Complete!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Test error:', error);
    process.exit(1);
  }
}

// Run tests
testScrapers();

