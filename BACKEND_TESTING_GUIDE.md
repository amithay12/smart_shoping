# Backend Testing Guide - Price Comparison System

## 🧪 Step-by-Step Testing Guide

### Prerequisites

1. **Backend server running**
   ```bash
   cd backend
   npm run dev
   ```
   Should see: `Server running in development mode on port 5001`

2. **MongoDB connected**
   Should see: `MongoDB Connected: ...`

3. **Have a user account** (for protected routes)
   - You need a Firebase auth token for protected endpoints

---

## Step 1: Seed Israeli Stores

Run the seed script to create real Israeli supermarkets:

```bash
cd backend
node scripts/seedStores.js
```

**Expected Output:**
```
✅ Created store: שופרסל - Shufersal
✅ Created store: רמי לוי - Rami Levy
✅ Created store: יוחננוף - Yohananof
✅ Created store: יס - Yes
✨ Seeding complete! Created/Found 6 stores
```

**Verify in MongoDB:**
```bash
# Or use MongoDB Compass
# Check that stores collection has 6 documents
```

---

## Step 2: Test Barcode Lookup

### Test 1: Lookup Product by Barcode

**Using curl:**
```bash
# Test with a real Israeli product barcode (e.g., Coca Cola)
curl http://localhost:5001/api/products/barcode/7290000064228

# Or use a common product
curl http://localhost:5001/api/products/barcode/3017620422003
```

**Expected Response:**
```json
{
  "success": true,
  "product": {
    "_id": "...",
    "barcode": "7290000064228",
    "name": "Product Name",
    "brand": "Brand Name",
    "category": "Beverages",
    "imageUrl": "...",
    "source": "openfoodfacts"
  }
}
```

**Using Postman/Thunder Client:**
- Method: `GET`
- URL: `http://localhost:5001/api/products/barcode/7290000064228`
- No headers needed (public endpoint)

---

## Step 3: Test Product Search

```bash
curl "http://localhost:5001/api/products/search?q=חלב&limit=10"
# Search for "חלב" (milk in Hebrew)

curl "http://localhost:5001/api/products/search?q=milk&limit=10"
# Or in English
```

**Expected Response:**
```json
{
  "success": true,
  "products": [
    {
      "_id": "...",
      "name": "Milk Product",
      "brand": "...",
      "barcode": "..."
    }
  ],
  "count": 5
}
```

---

## Step 4: Test Store Endpoints

### Test 4.1: Get All Stores

```bash
curl http://localhost:5001/api/stores
```

**Expected:** List of all 6 stores

### Test 4.2: Get Stores Near Location (Tel Aviv)

```bash
curl "http://localhost:5001/api/stores?lat=32.0853&lng=34.7818&maxDistance=10"
```

**Expected:** Stores near Tel Aviv coordinates

**Parameters:**
- `lat`: Latitude (32.0853 = Tel Aviv)
- `lng`: Longitude (34.7818 = Tel Aviv)
- `maxDistance`: Maximum distance in km (default: 50km)

---

## Step 5: Create Products and Prices

### Step 5.1: Lookup/Create Products

First, lookup some products to get their IDs:

```bash
# Get product 1
curl http://localhost:5001/api/products/barcode/7290000064228 > product1.json

# Get product 2
curl http://localhost:5001/api/products/barcode/3017620422003 > product2.json
```

Note the `_id` from the responses.

### Step 5.2: Get Store IDs

```bash
curl http://localhost:5001/api/stores > stores.json
```

Note the `_id` for each store (Shufersal, Rami Levy, etc.)

### Step 5.3: Add Prices to Stores

**Using curl (you'll need auth token):**

```bash
# Replace STORE_ID, PRODUCT_ID, and YOUR_TOKEN with actual values

# Add price at Shufersal
curl -X POST http://localhost:5001/api/stores/STORE_ID/products/PRODUCT_ID/price \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "price": 12.90,
    "currency": "ILS",
    "isAvailable": true,
    "inStock": true
  }'

# Add price at Rami Levy (different price)
curl -X POST http://localhost:5001/api/stores/STORE_ID/products/PRODUCT_ID/price \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "price": 11.50,
    "currency": "ILS",
    "isAvailable": true,
    "inStock": true
  }'
```

**Using Postman:**
1. Method: `POST`
2. URL: `http://localhost:5001/api/stores/{storeId}/products/{productId}/price`
3. Headers:
   - `Authorization: Bearer YOUR_TOKEN`
   - `Content-Type: application/json`
4. Body (JSON):
   ```json
   {
     "price": 12.90,
     "currency": "ILS",
     "isAvailable": true,
     "inStock": true
   }
   ```

---

## Step 6: Link Products to Shopping List

### Step 6.1: Add Item with Product Link

**Using curl:**
```bash
curl -X POST http://localhost:5001/api/list/item \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "חלב",
    "quantity": "1",
    "productId": "PRODUCT_ID_HERE",
    "barcode": "7290000064228"
  }'
```

**Expected:** Shopping list updated with product linked

### Step 6.2: Verify List Has Products

```bash
curl http://localhost:5001/api/list \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** List items should have `product` field populated

---

## Step 7: Test Basket Optimization (Main Feature!)

### Step 7.1: Optimize Basket

```bash
curl "http://localhost:5001/api/basket/optimize?lat=32.0853&lng=34.7818&maxDistance=50&maxStores=3" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Parameters:**
- `lat`: Your latitude (32.0853 = Tel Aviv)
- `lng`: Your longitude (34.7818 = Tel Aviv)
- `maxDistance`: Max distance in km (default: 50)
- `maxStores`: Max stores to consider (default: 3)

**Expected Response:**
```json
{
  "success": true,
  "options": [
    {
      "type": "single_store",
      "stores": [
        {
          "_id": "...",
          "name": "רמי לוי - Rami Levy",
          "chain": "Rami Levy"
        }
      ],
      "totalPrice": 45.90,
      "currency": "ILS",
      "itemsFound": 3,
      "itemsTotal": 3,
      "coverage": 100.0,
      "items": [...]
    },
    {
      "type": "two_stores",
      "stores": [...],
      "totalPrice": 42.50,
      "coverage": 100.0,
      ...
    }
  ],
  "summary": {
    "itemsTotal": 3,
    "storesFound": 6,
    "bestOption": {...}
  }
}
```

---

## Step 8: Test Product Prices Endpoint

```bash
curl "http://localhost:5001/api/stores/prices/PRODUCT_ID?lat=32.0853&lng=34.7818&maxDistance=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected:** List of prices for this product at all nearby stores, sorted by price

---

## 🐛 Troubleshooting

### Issue: "No stores found nearby"
**Solution:** 
- Check store coordinates are correct
- Increase `maxDistance` parameter
- Verify stores were created (check MongoDB)

### Issue: "No products linked to shopping list items"
**Solution:**
- Make sure you added items with `productId` or `barcode`
- Verify products exist in database
- Check shopping list items have `product` field

### Issue: "No prices found"
**Solution:**
- Make sure you added prices using `/api/stores/:storeId/products/:productId/price`
- Verify `isAvailable: true` and `inStock: true`
- Check product and store IDs are correct

### Issue: "401 Unauthorized"
**Solution:**
- Get a valid Firebase auth token
- Include it in `Authorization: Bearer TOKEN` header
- Make sure token hasn't expired

---

## 📝 Quick Test Script

Create a file `test-backend.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:5001"
TOKEN="YOUR_TOKEN_HERE"  # Replace with your token

echo "1. Testing barcode lookup..."
curl -s "$BASE_URL/api/products/barcode/7290000064228" | jq '.success'

echo "2. Testing store list..."
curl -s "$BASE_URL/api/stores" | jq '.count'

echo "3. Testing product search..."
curl -s "$BASE_URL/api/products/search?q=milk" | jq '.count'

echo "4. Testing basket optimization..."
curl -s "$BASE_URL/api/basket/optimize?lat=32.0853&lng=34.7818&maxDistance=50" \
  -H "Authorization: Bearer $TOKEN" | jq '.success'
```

Run with: `bash test-backend.sh`

---

## ✅ Checklist

- [ ] Stores seeded successfully (6 stores)
- [ ] Barcode lookup works
- [ ] Product search works
- [ ] Stores endpoint returns stores
- [ ] Can add prices to stores
- [ ] Can link products to shopping list items
- [ ] Basket optimization returns results
- [ ] Prices are sorted correctly
- [ ] Distance filtering works

---

## 🎯 Next Steps After Testing

Once backend is verified working:
1. ✅ Frontend barcode scanner component
2. ✅ Frontend product search screen
3. ✅ Frontend store comparison screen
4. ✅ Integration with shopping list

---

**Need help?** Check the console logs for detailed error messages!

