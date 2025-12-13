/**
 * Automated Backend Testing Script
 * Run with: node scripts/testBackend.js
 * 
 * Tests all price comparison endpoints
 */

require('dotenv').config({ path: './.env' });
const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:5001';
const TEST_TOKEN = process.env.TEST_TOKEN || ''; // Set this if testing protected routes

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name) {
  log(`\n🧪 Testing: ${name}`, 'blue');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

async function testBarcodeLookup() {
  logTest('Barcode Lookup');
  try {
    // Test with a common barcode
    const response = await axios.get(`${BASE_URL}/api/products/barcode/7290000064228`);
    
    if (response.data.success && response.data.product) {
      logSuccess(`Product found: ${response.data.product.name}`);
      logSuccess(`Source: ${response.data.source}`);
      return response.data.product._id;
    } else {
      logError('Product not found');
      return null;
    }
  } catch (error) {
    if (error.response?.status === 404) {
      logWarning('Product not found in database (this is OK for testing)');
    } else {
      logError(`Error: ${error.message}`);
    }
    return null;
  }
}

async function testProductSearch() {
  logTest('Product Search');
  try {
    const response = await axios.get(`${BASE_URL}/api/products/search?q=milk&limit=5`);
    
    if (response.data.success) {
      logSuccess(`Found ${response.data.count} products`);
      if (response.data.products.length > 0) {
        logSuccess(`First result: ${response.data.products[0].name}`);
      }
      return response.data.products[0]?._id || null;
    }
  } catch (error) {
    logError(`Error: ${error.message}`);
    return null;
  }
}

async function testGetStores() {
  logTest('Get Stores');
  try {
    const response = await axios.get(`${BASE_URL}/api/stores`);
    
    if (response.data.success) {
      logSuccess(`Found ${response.data.count} stores`);
      if (response.data.stores.length > 0) {
        response.data.stores.forEach(store => {
          log(`  - ${store.name} (${store.chain})`);
        });
        return response.data.stores.map(s => s._id);
      }
    }
    return [];
  } catch (error) {
    logError(`Error: ${error.message}`);
    return [];
  }
}

async function testGetStoresNearLocation() {
  logTest('Get Stores Near Location (Tel Aviv)');
  try {
    const response = await axios.get(
      `${BASE_URL}/api/stores?lat=32.0853&lng=34.7818&maxDistance=10`
    );
    
    if (response.data.success) {
      logSuccess(`Found ${response.data.count} stores near Tel Aviv`);
      return true;
    }
    return false;
  } catch (error) {
    logError(`Error: ${error.message}`);
    return false;
  }
}

async function testBasketOptimization(storeIds, productId) {
  logTest('Basket Optimization');
  
  if (!TEST_TOKEN) {
    logWarning('Skipping (requires auth token - set TEST_TOKEN env var)');
    return false;
  }

  if (!productId || storeIds.length === 0) {
    logWarning('Skipping (need products and stores first)');
    return false;
  }

  try {
    const response = await axios.get(
      `${BASE_URL}/api/basket/optimize?lat=32.0853&lng=34.7818&maxDistance=50&maxStores=3`,
      {
        headers: {
          Authorization: `Bearer ${TEST_TOKEN}`,
        },
      }
    );
    
    if (response.data.success) {
      logSuccess(`Found ${response.data.totalOptions || 0} optimization options`);
      if (response.data.options && response.data.options.length > 0) {
        const best = response.data.options[0];
        logSuccess(`Best option: ${best.type} - ${best.totalPrice} ${best.currency}`);
        logSuccess(`Coverage: ${best.coverage}% (${best.itemsFound}/${best.itemsTotal} items)`);
      }
      return true;
    }
    return false;
  } catch (error) {
    if (error.response?.status === 401) {
      logWarning('Unauthorized - check your TEST_TOKEN');
    } else {
      logError(`Error: ${error.message}`);
    }
    return false;
  }
}

async function runAllTests() {
  log('\n🚀 Starting Backend Tests...\n', 'blue');
  log(`Base URL: ${BASE_URL}\n`);

  const results = {
    barcode: false,
    search: false,
    stores: false,
    storesNearby: false,
    optimization: false,
  };

  // Test 1: Barcode lookup
  const productId = await testBarcodeLookup();
  results.barcode = productId !== null;

  // Test 2: Product search
  const searchProductId = await testProductSearch();
  results.search = searchProductId !== null;

  // Test 3: Get all stores
  const storeIds = await testGetStores();
  results.stores = storeIds.length > 0;

  // Test 4: Get stores near location
  results.storesNearby = await testGetStoresNearLocation();

  // Test 5: Basket optimization (requires auth)
  results.optimization = await testBasketOptimization(storeIds, productId || searchProductId);

  // Summary
  log('\n📊 Test Summary:', 'blue');
  log(`Barcode Lookup: ${results.barcode ? '✅' : '❌'}`, results.barcode ? 'green' : 'red');
  log(`Product Search: ${results.search ? '✅' : '❌'}`, results.search ? 'green' : 'red');
  log(`Get Stores: ${results.stores ? '✅' : '❌'}`, results.stores ? 'green' : 'red');
  log(`Stores Near Location: ${results.storesNearby ? '✅' : '❌'}`, results.storesNearby ? 'green' : 'red');
  log(`Basket Optimization: ${results.optimization ? '✅' : '⚠️ '}`, results.optimization ? 'green' : 'yellow');

  const passed = Object.values(results).filter(r => r).length;
  const total = Object.keys(results).length;

  log(`\n✨ Tests passed: ${passed}/${total}`, passed === total ? 'green' : 'yellow');

  if (passed < total) {
    log('\n💡 Tips:', 'yellow');
    if (!results.barcode) {
      log('  - Try different barcodes or check internet connection', 'yellow');
    }
    if (!results.stores) {
      log('  - Run: node scripts/seedStores.js', 'yellow');
    }
    if (!results.optimization) {
      log('  - Set TEST_TOKEN env var and ensure you have products linked to your list', 'yellow');
    }
  }
}

// Run tests
runAllTests().catch(error => {
  logError(`Fatal error: ${error.message}`);
  process.exit(1);
});

