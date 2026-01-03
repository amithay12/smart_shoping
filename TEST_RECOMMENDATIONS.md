# Testing Recommendations System

## ✅ Fake Data Generated Successfully!
- 100 fake users created
- 47,437 purchase records generated
- 201 unique products in the system

## Testing Steps

### Option 1: Test via API (Quick)

1. **Get your auth token** from your app (check network requests in browser/React Native debugger)

2. **Get products from fake users** (to use in your list):
```bash
# Connect to MongoDB and find a product barcode from fake users
mongosh YOUR_MONGO_URI
```

```javascript
// In MongoDB shell:
// Find products that fake users have purchased
db.changehistories.aggregate([
  { $match: { action: "PURCHASE_ITEM", "itemDetails.barcode": { $exists: true } } },
  { $group: { _id: "$itemDetails.barcode", count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 10 }
])
```

3. **Add a product to your shopping list** (via your app or API):
```bash
# Replace YOUR_TOKEN and PRODUCT_BARCODE
curl -X POST http://localhost:5001/api/list/item \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "חלב 3% 1 ליטר",
    "quantity": "1",
    "barcode": "7290000072623"
  }'
```

4. **Get recommendations**:
```bash
curl -X GET http://localhost:5001/api/recommendations \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Option 2: Test via Your App (Recommended)

1. **Open your app** and log in

2. **Add products to your shopping list**:
   - Use the barcode scanner to add products
   - OR manually add products with barcodes (try these common ones):
     - `7290000072623` - חלב 3% 1 ליטר (Milk)
     - `7290000072630` - ביצים L (Eggs)
     - `7290000063539` - לחם אחיד (Bread)

3. **Go to Recommendations screen** in your app
   - You should see global recommendations based on what fake users buy together

### Option 3: Quick MongoDB Query Test

1. **Find a product that many fake users bought**:
```javascript
// In MongoDB shell
db.changehistories.aggregate([
  { 
    $match: { 
      action: "PURCHASE_ITEM",
      "itemDetails.barcode": { $exists: true, $ne: null }
    }
  },
  {
    $group: {
      _id: "$itemDetails.barcode",
      name: { $first: "$itemDetails.name" },
      count: { $sum: 1 }
    }
  },
  { $sort: { count: -1 } },
  { $limit: 5 }
])
```

2. **Find what products are bought together** with a specific product:
```javascript
// Example: Find what's bought with product barcode "7290000072623"
const targetBarcode = "7290000072623";

// Step 1: Find households that bought this product
const households = db.changehistories.distinct("household", {
  action: "PURCHASE_ITEM",
  "itemDetails.barcode": targetBarcode
});

// Step 2: Find other products bought by these households within 3 days
db.changehistories.aggregate([
  {
    $match: {
      action: "PURCHASE_ITEM",
      household: { $in: households },
      "itemDetails.barcode": { $ne: targetBarcode, $exists: true }
    }
  },
  {
    $group: {
      _id: "$itemDetails.barcode",
      name: { $first: "$itemDetails.name" },
      count: { $sum: 1 }
    }
  },
  { $sort: { count: -1 } },
  { $limit: 10 }
])
```

## Expected Results

### Global Recommendations Should Show:
- Products frequently bought together with items in your shopping list
- Based on purchase patterns from the 100 fake users
- Includes real product data (barcode, name, brand, etc.)

### Example Scenario:
1. Add "חלב" (Milk - barcode: 7290000072623) to your list
2. System finds: Many fake users who bought "חלב" also bought "ביצים" (Eggs)
3. Recommendation: "ביצים" (Eggs) should appear

## Troubleshooting

### No recommendations showing?
1. Make sure you have products with barcodes in your shopping list
2. Check that fake users have purchase history for those products
3. Verify your auth token is valid

### Check if fake data exists:
```javascript
// In MongoDB shell
db.changehistories.count({ action: "PURCHASE_ITEM" })
// Should return ~47,437

db.users.count({ email: /^fakeuser/ })
// Should return 100

db.shoppinglists.count({})
// Should return 100+ (your lists + fake users)
```

### Test the recommendation endpoint directly:
```bash
# Make sure you're logged in and have a valid token
curl -v http://localhost:5001/api/recommendations \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## What to Look For

✅ **Global Recommendations:**
- "People who buy X also buy this (N times)"
- Products with real barcodes
- Score/confidence indicator

✅ **Personal Recommendations:**
- "Usually buy every X days"
- Based on your purchase history
- Days since last purchase

