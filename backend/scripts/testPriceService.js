/**
 * Test script for government price service
 * Tests downloading and parsing price files from Israeli supermarkets
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const governmentPriceService = require('../services/scrapers/governmentPriceService');

async function testPriceService() {
  console.log('🧪 Testing Government Price Service\n');

  // Test 1: Search for eggs barcode
  console.log('Test 1: Searching for barcode 7290001201596 (eggs)...');
  try {
    const results = await governmentPriceService.searchByBarcode('7290001201596');
    console.log(`✅ Found ${results.length} stores with this product:`);
    results.forEach(r => {
      console.log(`   - ${r.store}: ${r.product.name} - ${r.product.price} ILS`);
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n');

  // Test 2: Search for milk barcode
  console.log('Test 2: Searching for barcode 7290004131074 (milk)...');
  try {
    const results = await governmentPriceService.searchByBarcode('7290004131074');
    console.log(`✅ Found ${results.length} stores with this product:`);
    results.forEach(r => {
      console.log(`   - ${r.store}: ${r.product.name} - ${r.product.price} ILS`);
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n');

  // Test 3: Get top products from Shufersal
  console.log('Test 3: Getting top 10 products from Shufersal...');
  try {
    const products = await governmentPriceService.getTopProducts('Shufersal', 10);
    console.log(`✅ Found ${products.length} products:`);
    products.slice(0, 5).forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name} (${p.barcode}) - ${p.price} ILS`);
    });
    if (products.length > 5) {
      console.log(`   ... and ${products.length - 5} more`);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n✅ Testing complete!');
}

// Run tests
testPriceService().catch(console.error);





















