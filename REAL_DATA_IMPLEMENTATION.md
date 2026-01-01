# Real Data Implementation Guide - Israeli Supermarkets

## 🎯 Overview

This system scrapes **REAL** product data, prices, and store locations from Israeli supermarket websites:
- **Shufersal** (שופרסל)
- **Rami Levy** (רמי לוי)
- **Yohananof** (יוחננוף)
- **Yes** (יס)

## ⚠️ Important Legal & Ethical Considerations

### Before You Start:

1. **Check Terms of Service**: Review each supermarket's ToS regarding web scraping
2. **Rate Limiting**: Implement delays between requests to avoid overloading servers
3. **Respect robots.txt**: Check each site's robots.txt file
4. **User-Agent**: Use proper user-agent headers
5. **Legal Consultation**: Consider consulting a lawyer about web scraping legality in Israel

### Best Practices:
- ✅ Use reasonable delays (1-2 seconds between requests)
- ✅ Cache data to reduce requests
- ✅ Use official APIs if available
- ✅ Respect server resources
- ❌ Don't overload servers with too many requests
- ❌ Don't scrape personal data
- ❌ Don't bypass security measures

---

## 🏗️ Architecture

### Scraper System

```
scraperManager (orchestrator)
    ├── ShufersalScraper
    ├── RamiLevyScraper
    ├── YohananofScraper
    └── YesScraper
```

Each scraper:
- Searches products by barcode
- Searches products by name
- Gets current prices
- Gets store locations

---

## 📋 Implementation Steps

### Step 1: Research Each Website's Structure

You need to inspect each supermarket's website to understand:

1. **Search Endpoints**: How do they search for products?
   - API endpoints?
   - HTML pages?
   - JavaScript-rendered content?

2. **Product Data Format**: How is product data structured?
   - JSON API responses?
   - HTML elements with specific classes?
   - JavaScript variables?

3. **Store Locations**: Where are store locations stored?
   - Store locator API?
   - Static JSON files?
   - HTML pages?

### Step 2: Implement Scrapers

Each scraper needs to handle:

#### Option A: API-Based (Preferred)
If the website has an API:
```javascript
// Example: Shufersal API
const response = await axios.get(
  'https://www.shufersal.co.il/api/search?barcode=1234567890'
);
```

#### Option B: HTML Scraping
If no API, scrape HTML:
```javascript
const response = await axios.get(productUrl);
const $ = cheerio.load(response.data);
const price = $('.product-price').text();
```

#### Option C: JavaScript Rendering (Puppeteer)
If content is JavaScript-rendered:
```javascript
const browser = await puppeteer.launch();
const page = await browser.newPage();
await page.goto(productUrl);
const price = await page.$eval('.price', el => el.textContent);
```

---

## 🔧 How to Find Website Structure

### Method 1: Browser DevTools

1. Open supermarket website
2. Open DevTools (F12)
3. Go to Network tab
4. Search for a product
5. Look for API calls (XHR/Fetch)
6. Inspect the response structure

### Method 2: View Page Source

1. Right-click → View Page Source
2. Search for product data
3. Look for JSON data in `<script>` tags
4. Find API endpoints

### Method 3: Use Browser Extensions

- **Postman Interceptor**: Capture API calls
- **ModHeader**: Modify headers
- **JSON Formatter**: Format JSON responses

---

## 📝 Example: Implementing Shufersal Scraper

### 1. Research Shufersal Website

Visit: https://www.shufersal.co.il

**Findings:**
- Search URL: `https://www.shufersal.co.il/online/search?q=BARCODE`
- API endpoint: `https://www.shufersal.co.il/api/v1/products/search`
- Product data in JSON format
- Store locations: `https://www.shufersal.co.il/api/v1/stores`

### 2. Update ShufersalScraper

```javascript
async searchByBarcode(barcode) {
  // Use actual Shufersal API endpoint
  const response = await axios.get(
    `https://www.shufersal.co.il/api/v1/products/search`,
    {
      params: { barcode },
      headers: this.headers,
    }
  );
  
  // Parse actual response structure
  return this.parseProduct(response.data.product);
}
```

### 3. Test the Scraper

```bash
node scripts/testScraper.js shufersal 7290000064228
```

---

## 🔄 Price Update Workflow

### Automatic Updates

Create a cron job or scheduled task:

```javascript
// Update prices every hour
setInterval(async () => {
  // Get all active products
  const products = await Product.find({});
  
  for (const product of products) {
    await scraperManager.updateProductPrices(product._id);
    await sleep(2000); // Rate limiting
  }
}, 3600000); // 1 hour
```

### Manual Updates

Via API:
```bash
POST /api/scraper/update-shopping-list
Authorization: Bearer YOUR_TOKEN
```

---

## 🗺️ Store Locations

### Sync Store Locations

```bash
POST /api/scraper/sync-stores
Authorization: Bearer YOUR_TOKEN
```

This will:
1. Fetch all store locations from each scraper
2. Create/update stores in database
3. Include real addresses and coordinates

---

## 🧪 Testing Real Data

### Test Script

```javascript
// scripts/testRealData.js
const scraperManager = require('../services/scrapers/scraperManager');

async function test() {
  // Test barcode search
  const results = await scraperManager.searchProductAcrossStores('7290000064228');
  console.log('Products found:', results);
  
  // Test store sync
  const stores = await scraperManager.syncStoreLocations();
  console.log('Stores synced:', stores);
}

test();
```

---

## 📊 Data Flow

```
User scans barcode
    ↓
Barcode lookup (Open Food Facts)
    ↓
Product saved to database
    ↓
Scraper searches all stores
    ↓
Prices saved to StoreProduct
    ↓
Basket optimization uses real prices
    ↓
User sees real prices and locations
```

---

## 🚨 Common Issues & Solutions

### Issue 1: Website Blocks Requests
**Solution:**
- Use rotating User-Agents
- Add delays between requests
- Use proxy servers
- Consider using Puppeteer with stealth plugin

### Issue 2: Website Structure Changes
**Solution:**
- Version control scrapers
- Add fallback parsing methods
- Monitor for errors
- Update scrapers when structure changes

### Issue 3: Rate Limiting
**Solution:**
- Implement exponential backoff
- Cache responses
- Use request queuing
- Respect rate limits

### Issue 4: JavaScript-Rendered Content
**Solution:**
- Use Puppeteer or Playwright
- Wait for content to load
- Handle dynamic content

---

## 🔐 Security & Privacy

1. **Don't store personal data** from websites
2. **Respect privacy policies**
3. **Use HTTPS** for all requests
4. **Don't share API keys** or credentials
5. **Implement error handling** to avoid exposing internal structure

---

## 📈 Performance Optimization

1. **Cache Results**: Cache product data for 1 hour
2. **Batch Updates**: Update multiple products in one request if possible
3. **Parallel Requests**: Use Promise.all() for independent requests
4. **Database Indexing**: Index barcode, store, and product fields
5. **Background Jobs**: Use queue system (Bull/BullMQ) for price updates

---

## ✅ Next Steps

1. **Research Each Website**: 
   - Inspect Shufersal, Rami Levy, Yohananof, Yes websites
   - Find their API endpoints or HTML structure
   - Document the data format

2. **Implement Scrapers**:
   - Update each scraper with real endpoints
   - Test with real barcodes
   - Handle errors gracefully

3. **Test Real Data**:
   - Test with Israeli product barcodes
   - Verify prices match website prices
   - Test store locations

4. **Set Up Auto-Updates**:
   - Create scheduled job for price updates
   - Monitor for failures
   - Alert on errors

5. **Monitor & Maintain**:
   - Monitor scraper success rates
   - Update when websites change
   - Handle new stores/products

---

## 📚 Resources

- [Cheerio Documentation](https://cheerio.js.org/)
- [Puppeteer Documentation](https://pptr.dev/)
- [Axios Documentation](https://axios-http.com/)
- [Web Scraping Best Practices](https://www.scrapehero.com/web-scraping-best-practices/)

---

## ⚖️ Legal Disclaimer

This implementation guide is for educational purposes. Always:
- Check local laws regarding web scraping
- Review website Terms of Service
- Consult with legal counsel
- Respect website owners' rights
- Use official APIs when available

---

**Status**: Framework ready. You need to research each website's actual structure and implement the scrapers accordingly.

