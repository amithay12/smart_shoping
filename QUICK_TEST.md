# Quick Test - Recommendations

## Step 1: Find a Product Barcode to Test

Run this in MongoDB shell to find products that many fake users bought:

```javascript
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

Copy one of the barcodes (e.g., `7290000072623`)

## Step 2: Add Product to Your Shopping List

**Option A: Via App**
- Open your app
- Go to Shopping List
- Scan barcode or manually add the product with the barcode you found

**Option B: Via API**
```bash
# Replace YOUR_TOKEN and BARCODE
curl -X POST http://localhost:5001/api/list/item \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Product Name",
    "quantity": "1",
    "barcode": "7290000072623"
  }'
```

## Step 3: Check Recommendations

**Option A: Via App**
- Go to Recommendations screen
- You should see products that fake users bought together with your item

**Option B: Via API**
```bash
curl -X GET http://localhost:5001/api/recommendations \
  -H "Authorization: Bearer YOUR_TOKEN" | jq
```

## Expected Result

You should see recommendations like:
```json
{
  "recommendations": [
    {
      "name": "Product Name",
      "barcode": "7290000072630",
      "productId": "...",
      "reason": "People who buy X also buy this (30 times)",
      "source": "global",
      "score": 30
    }
  ]
}
```

