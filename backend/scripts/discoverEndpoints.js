/**
 * Endpoint Discovery Script
 * Helps find real API endpoints for Israeli supermarkets
 * Run with: node scripts/discoverEndpoints.js
 */

const axios = require('axios');
const https = require('https');

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

// Test URLs to try
const testUrls = {
  government: [
    'https://prices.shufersal.co.il',
    'https://prices.shufersal.co.il/FileObject/GetFile',
    'https://www.gov.il/api/prices',
  ],
  shufersal: [
    'https://www.shufersal.co.il/online',
    'https://www.shufersal.co.il/api',
    'https://www.shufersal.co.il/online/v/online/search',
  ],
  ramiLevy: [
    'https://www.ramilevy.co.il/api',
    'https://www.ramilevy.co.il/api/search',
  ],
  yohananof: [
    'https://www.yohananof.co.il/api',
    'https://www.yohananof.co.il/api/search',
  ],
  victory: [
    'https://www.victory.co.il/api',
    'https://www.victory.co.il/api/products',
  ],
};

async function testUrl(url, params = {}) {
  try {
    const response = await axios.get(url, {
      params,
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });

    return {
      success: true,
      status: response.status,
      contentType: response.headers['content-type'],
      dataType: typeof response.data,
      dataLength: JSON.stringify(response.data).length,
      sample: JSON.stringify(response.data).substring(0, 200),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: error.response?.status,
    };
  }
}

async function discoverEndpoints() {
  log('\n🔍 Discovering Real API Endpoints...\n', 'blue');
  log('='.repeat(60));

  // Test Government API
  log('\n1. Testing Government Price Transparency API:', 'yellow');
  for (const url of testUrls.government) {
    log(`   Testing: ${url}`);
    const result = await testUrl(url);
    if (result.success) {
      log(`   ✅ Success! Status: ${result.status}, Type: ${result.contentType}`, 'green');
      log(`   Sample: ${result.sample}...`);
    } else {
      log(`   ❌ Failed: ${result.error}`, 'red');
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Test Shufersal
  log('\n2. Testing Shufersal:', 'yellow');
  for (const url of testUrls.shufersal) {
    log(`   Testing: ${url}`);
    const result = await testUrl(url, { q: 'test' });
    if (result.success) {
      log(`   ✅ Success!`, 'green');
    } else {
      log(`   ❌ Failed: ${result.error}`, 'red');
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Test Rami Levy
  log('\n3. Testing Rami Levy:', 'yellow');
  for (const url of testUrls.ramiLevy) {
    log(`   Testing: ${url}`);
    const result = await testUrl(url);
    if (result.success) {
      log(`   ✅ Success!`, 'green');
    } else {
      log(`   ❌ Failed: ${result.error}`, 'red');
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Test Yohananof
  log('\n4. Testing Yohananof:', 'yellow');
  for (const url of testUrls.yohananof) {
    log(`   Testing: ${url}`);
    const result = await testUrl(url);
    if (result.success) {
      log(`   ✅ Success!`, 'green');
    } else {
      log(`   ❌ Failed: ${result.error}`, 'red');
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Test Victory
  log('\n5. Testing Victory:', 'yellow');
  for (const url of testUrls.victory) {
    log(`   Testing: ${url}`);
    const result = await testUrl(url);
    if (result.success) {
      log(`   ✅ Success!`, 'green');
    } else {
      log(`   ❌ Failed: ${result.error}`, 'red');
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  log('\n' + '='.repeat(60));
  log('\n💡 Next Steps:', 'blue');
  log('1. Check which URLs returned success');
  log('2. Inspect the response structure');
  log('3. Update scrapers with working endpoints');
  log('4. Test with real product barcodes\n');
}

discoverEndpoints().catch(error => {
  log(`\n❌ Error: ${error.message}`, 'red');
  process.exit(1);
});

