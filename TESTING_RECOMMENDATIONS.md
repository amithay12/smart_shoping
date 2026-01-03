# Testing the Recommendation System

## Overview
The recommendation system tracks your purchase patterns and recommends products you usually buy when enough time has passed since your last purchase.

## Prerequisites
1. Backend server running (`npm start` in backend folder)
2. Frontend app running (React Native/Expo)
3. User account logged in

## Testing Steps

### Step 1: Add Products with Barcodes to Your Shopping List
To test properly, you need products that have barcodes/product IDs:

1. Open the app and go to the Shopping List screen
2. Use the barcode scanner to add products (this ensures products have barcodes)
3. Add at least 2-3 different products with barcodes
4. Mark them as purchased (long press → "Mark as Purchased")

**Important:** Products added via barcode scanner will have product IDs/barcodes stored, which allows the system to track them accurately.

### Step 2: Create Purchase History
You need at least **2 purchases of the same product** to calculate an average interval:

1. Add a product to your list (e.g., "Milk")
2. Mark it as purchased
3. Wait a few minutes (or manually adjust timestamps in database for testing)
4. Add the same product again
5. Mark it as purchased again

The system needs at least 2 purchases to calculate: `averageInterval = (date2 - date1) / 1`

### Step 3: Wait for Recommendation Interval
For a product with an average interval of 7 days:
- After 7+ days pass since the last purchase
- AND the product is NOT currently on your shopping list
- → It should appear in recommendations

### Step 4: Check Recommendations Screen
1. Go to the Recommendations screen in the app
2. You should see products you usually buy
3. Each recommendation shows:
   - Product name and brand
   - Purchase count (must be ≥2)
   - Average frequency (e.g., "Usually every 7 days")
   - Days since last purchase
   - "Add" button

### Step 5: Add Recommendation to List
1. Click "Add" on a recommendation
2. Go back to Shopping List screen
3. The product should appear with its barcode/product ID linked
4. The recommendation should disappear from Recommendations screen

## Quick Testing with Database Queries

If you want to test faster, you can manually check the database:

### Check Purchase History
```javascript
// In MongoDB shell or MongoDB Compass
db.changehistories.find({
  action: "PURCHASE_ITEM"
}).sort({ createdAt: -1 }).limit(10)
```

### Check if Recommendations Endpoint Works
```bash
# Get your auth token from the app (check network requests)
curl -X GET http://localhost:5001/api/recommendations \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Manually Create Test Purchase History (for quick testing)
```javascript
// In MongoDB, you can manually insert purchase records with different dates
// This simulates buying the same product multiple times over time
```

## Expected Behavior

### ✅ Should Recommend:
- Products you've purchased 2+ times
- Products where `daysSinceLastPurchase >= averageFrequencyDays`
- Products NOT currently on your shopping list
- Products with barcodes/product IDs

### ❌ Should NOT Recommend:
- Products you've only purchased once (can't calculate interval)
- Products already on your shopping list
- Products where not enough time has passed since last purchase

## Troubleshooting

### No Recommendations Showing?
1. **Check purchase count**: Need at least 2 purchases of the same product
2. **Check product linking**: Products need barcodes/product IDs (use barcode scanner)
3. **Check time interval**: Wait until `daysSinceLastPurchase >= averageFrequency`
4. **Check current list**: Products already on list won't be recommended

### Recommendations Not Linking to Products?
1. Make sure products were added via barcode scanner (not manual text entry)
2. Check that ChangeHistory records include `itemDetails.barcode` or `itemDetails.product`
3. Verify Product collection has matching barcodes

### Test with Different Intervals
- **Short interval (1-2 days)**: Good for testing quickly
- **Medium interval (7 days)**: Realistic for weekly shopping
- **Long interval (30 days)**: Monthly recurring items

## Database Schema Check

Verify your ChangeHistory records have the new fields:
```javascript
db.changehistories.findOne({
  action: "PURCHASE_ITEM"
})
// Should show:
// itemDetails: {
//   name: "...",
//   quantity: "...",
//   product: ObjectId("..."),  // ← Should exist
//   barcode: "..."             // ← Should exist
// }
```

## API Response Format

The recommendations endpoint should return:
```json
{
  "recommendations": [
    {
      "name": "Product Name",
      "barcode": "7290000072623",
      "productId": "507f1f77bcf86cd799439011",
      "brand": "Brand Name",
      "category": "Category",
      "imageUrl": "https://...",
      "quantity": "1",
      "averageFrequencyDays": 7.5,
      "daysSinceLastPurchase": 8.2,
      "purchaseCount": 3,
      "lastPurchaseDate": "2024-01-15T10:00:00.000Z",
      "reason": "Usually buy every 8 days"
    }
  ],
  "count": 1,
  "message": "Found 1 product you usually buy"
}
```

