# Price Comparison & Basket Optimization - Implementation Guide

## ✅ What's Been Implemented

### Backend Models

1. **Product Model** (`backend/models/Product.js`)
   - Stores product information with barcode support
   - Fields: barcode, name, brand, category, imageUrl, unit, size
   - Indexed for fast lookups

2. **Store Model** (`backend/models/Store.js`)
   - Stores supermarket/store information
   - Includes location (geospatial) for distance calculations
   - Fields: name, chain, address, location (lat/lng), phone, hours

3. **StoreProduct Model** (`backend/models/StoreProduct.js`)
   - Links products to stores with pricing
   - Fields: product, store, price, currency, availability, price history
   - Core model for price comparison

4. **Updated ShoppingList Model**
   - Added `product` reference and `barcode` field to items
   - Allows linking list items to real products

### Backend Services

1. **Barcode Service** (`backend/services/barcodeService.js`)
   - Uses Open Food Facts API (free, no API key)
   - Fallback to UPCitemdb API
   - Caches products in database
   - Product search functionality

### Backend Controllers & Routes

1. **Product Controller** (`backend/controllers/productController.js`)
   - `GET /api/products/barcode/:barcode` - Lookup by barcode
   - `GET /api/products/search?q=query` - Search products
   - `GET /api/products/:productId` - Get product details

2. **Store Controller** (`backend/controllers/storeController.js`)
   - `GET /api/stores` - Get stores (with location filtering)
   - `POST /api/stores` - Create store (protected)
   - `GET /api/stores/prices/:productId` - Get product prices across stores
   - `POST /api/stores/:storeId/products/:productId/price` - Update price (protected)

3. **Basket Controller** (`backend/controllers/basketController.js`)
   - `GET /api/basket/optimize?lat=&lng=&maxDistance=&maxStores=` - Optimize shopping basket
   - Algorithm finds cheapest combination of stores
   - Considers distance and product availability
   - Returns single-store and multi-store options

### Routes Added to Server

All routes are registered in `backend/server.js`:
- `/api/products/*`
- `/api/stores/*`
- `/api/basket/*`

## 🚀 Next Steps: Frontend Implementation

### 1. Barcode Scanner Component

**File:** `frontend/components/BarcodeScanner.js`

You'll need to install:
```bash
cd frontend
npm install expo-barcode-scanner
```

**Features needed:**
- Camera-based barcode scanning
- Manual barcode entry fallback
- Product lookup after scan
- Link product to shopping list item

### 2. Product Search Screen

**File:** `frontend/screens/ProductSearchScreen.js`

**Features:**
- Search products by name
- Display product cards with images
- Link product to shopping list
- Show barcode if available

### 3. Store Comparison Screen

**File:** `frontend/screens/StoreComparisonScreen.js`

**Features:**
- Call `/api/basket/optimize` with user location
- Display optimized basket options
- Show:
  - Total price per option
  - Store names and locations
  - Items found vs total items
  - Coverage percentage
- Map view of stores (optional)
- "View Details" for each option

### 4. Update ShoppingListScreen

**Updates needed:**
- Add "Scan Barcode" button
- Show product info if item is linked
- Add "Optimize Basket" button
- Link to Store Comparison screen

## 📝 API Usage Examples

### 1. Lookup Product by Barcode
```javascript
GET /api/products/barcode/1234567890123
Response: {
  success: true,
  product: { barcode, name, brand, category, imageUrl, ... },
  source: "openfoodfacts" | "database"
}
```

### 2. Search Products
```javascript
GET /api/products/search?q=milk&limit=20
Response: {
  success: true,
  products: [...],
  count: 15
}
```

### 3. Get Stores Near Location
```javascript
GET /api/stores?lat=40.7128&lng=-74.0060&maxDistance=10
Response: {
  success: true,
  stores: [...],
  count: 5
}
```

### 4. Optimize Basket
```javascript
GET /api/basket/optimize?lat=40.7128&lng=-74.0060&maxDistance=50&maxStores=3
Response: {
  success: true,
  options: [
    {
      type: "single_store" | "two_stores",
      stores: [...],
      totalPrice: 45.99,
      currency: "USD",
      itemsFound: 8,
      itemsTotal: 10,
      coverage: 80.0,
      items: [...]
    }
  ],
  summary: {
    itemsTotal: 10,
    storesFound: 5,
    bestOption: {...}
  }
}
```

## 🧪 Testing & Data Setup

### 1. Create Sample Stores

You can use the API or create a script:

```javascript
POST /api/stores
{
  "name": "Walmart Supercenter",
  "chain": "Walmart",
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "state": "NY",
    "zipCode": "10001"
  },
  "location": {
    "coordinates": [-74.0060, 40.7128] // [lng, lat]
  },
  "phone": "+1-555-123-4567"
}
```

### 2. Add Product Prices

```javascript
POST /api/stores/:storeId/products/:productId/price
{
  "price": 3.99,
  "currency": "USD",
  "isAvailable": true,
  "inStock": true
}
```

### 3. Link Products to Shopping List Items

When adding items, include `productId` or `barcode`:

```javascript
POST /api/list/item
{
  "name": "Milk",
  "quantity": "1",
  "productId": "507f1f77bcf86cd799439011",
  "barcode": "1234567890123"
}
```

## 🎯 Algorithm Details

### Basket Optimization Logic

1. **Get Shopping List**: Retrieves unpurchased items
2. **Find Nearby Stores**: Uses geospatial query (within maxDistance)
3. **Get Prices**: Fetches prices for all products at all stores
4. **Calculate Options**:
   - Single store: Total if all items available
   - Two stores: Choose cheapest price per item, calculate total
   - Multi-store: Similar logic (extendable)
5. **Filter & Sort**:
   - Prefer options with 100% coverage
   - Sort by coverage (desc), then price (asc)
   - Return top 5 options

### Distance Calculation

Uses MongoDB's `$near` geospatial operator:
- Requires `2dsphere` index (already added)
- Distance in meters
- Sorts by proximity automatically

## 🔧 Configuration

### Environment Variables

No new environment variables needed! The barcode service uses free APIs.

### Dependencies Added

- `axios` - For API calls to barcode lookup services

## 📱 Frontend Dependencies Needed

```bash
cd frontend
npm install expo-barcode-scanner
npm install expo-location  # For getting user location
```

## 🐛 Known Limitations & Future Improvements

1. **Price Data**: Currently manual entry. Consider:
   - Web scraping (with permission)
   - Store API integrations
   - User-submitted prices
   - Price tracking over time

2. **Distance Calculation**: Currently uses straight-line distance. Could add:
   - Driving distance (Google Maps API)
   - Travel time
   - Traffic considerations

3. **Basket Optimization**: Current algorithm is greedy. Could improve:
   - Consider travel cost/time
   - Multi-store route optimization
   - Store hours consideration

4. **Product Matching**: Could add:
   - Fuzzy matching for similar products
   - Unit conversion (e.g., 500ml vs 1L)
   - Brand alternatives

## 📚 Resources

- [Open Food Facts API](https://world.openfoodfacts.org/data)
- [UPCitemdb API](https://www.upcitemdb.com/api)
- [MongoDB Geospatial Queries](https://docs.mongodb.com/manual/geospatial-queries/)

## ✅ Checklist for Full Implementation

- [x] Backend models (Product, Store, StoreProduct)
- [x] Barcode lookup service
- [x] Product & Store controllers
- [x] Basket optimization algorithm
- [x] API routes
- [ ] Frontend barcode scanner
- [ ] Frontend product search
- [ ] Frontend store comparison screen
- [ ] Location permissions handling
- [ ] Error handling & loading states
- [ ] Testing with real data

---

**Status**: Backend is complete! Ready for frontend implementation.

