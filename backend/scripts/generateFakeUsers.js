/**
 * Script to generate 100 fake users with shopping lists containing 50 real products each
 * This creates realistic test data for the global recommendation system
 * 
 * Usage: node backend/scripts/generateFakeUsers.js
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI;
const User = require('../models/User');
const Household = require('../models/Household');
const ShoppingList = require('../models/ShoppingList');
const ChangeHistory = require('../models/ChangeHistory');
const Product = require('../models/Product');

// Connect to database
async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

/**
 * Get real products with barcodes from the database
 * If not enough products exist, we'll use some common Israeli product barcodes
 */
async function getRealProducts(count = 100) {
  // First, try to get products from the database
  const dbProducts = await Product.find({ barcode: { $exists: true, $ne: null } })
    .limit(count)
    .lean();

  console.log(`Found ${dbProducts.length} products in database`);

  // If we don't have enough products, we'll need to create some common ones
  // Using real Israeli product barcodes
  const commonProducts = [
    { barcode: '7290000072623', name: 'חלב 3% 1 ליטר', brand: 'תנובה', category: 'Dairy' },
    { barcode: '7290000072630', name: 'ביצים L', brand: 'תנובה', category: 'Dairy' },
    { barcode: '7290000063539', name: 'לחם אחיד', brand: 'אחלה', category: 'Bakery' },
    { barcode: '7290013119204', name: 'חמאה 200 גרם', brand: 'תנובה', category: 'Dairy' },
    { barcode: '7290000072654', name: 'גבינה לבנה 5%', brand: 'תנובה', category: 'Dairy' },
    { barcode: '7290014114141', name: 'יוגורט דנונה', brand: 'תנובה', category: 'Dairy' },
    { barcode: '7290014065108', name: 'קוטג\' 5%', brand: 'תנובה', category: 'Dairy' },
    { barcode: '7290014065092', name: 'גבינה צהובה', brand: 'תנובה', category: 'Dairy' },
    { barcode: '7290006712004', name: 'שמן קנולה', brand: 'החברה המרכזית', category: 'Oils' },
    { barcode: '7290002750243', name: 'סוכר לבן 1 ק"ג', brand: 'דן', category: 'Baking' },
    { barcode: '7290002750076', name: 'קמח לבן 1 ק"ג', brand: 'דן', category: 'Baking' },
    { barcode: '7290002750250', name: 'מלח ים', brand: 'דן', category: 'Baking' },
    { barcode: '7290010062002', name: 'פילפלים חריפים', brand: 'אשדודית', category: 'Canned' },
    { barcode: '7290014065191', name: 'רוטב עגבניות', brand: 'אשדודית', category: 'Sauces' },
    { barcode: '7290002750606', name: 'פסטה ספגטי', brand: 'דן', category: 'Pasta' },
    { barcode: '7290014114257', name: 'אורז לבן', brand: 'דן', category: 'Grains' },
    { barcode: '7290014065047', name: 'חומוס', brand: 'אשדודית', category: 'Legumes' },
    { barcode: '7290014114301', name: 'שעועית לבנה', brand: 'אשדודית', category: 'Legumes' },
    { barcode: '7290014065085', name: 'עגבניות מרוסקות', brand: 'אשדודית', category: 'Canned' },
    { barcode: '7290002750538', name: 'אפונה ירוקה', brand: 'אשדודית', category: 'Canned' },
    { barcode: '7290014065122', name: 'תירס', brand: 'אשדודית', category: 'Canned' },
    { barcode: '7290014114356', name: 'טונה בשמן', brand: 'אופק', category: 'Canned' },
    { barcode: '7290014114400', name: 'סרדינים', brand: 'אופק', category: 'Canned' },
    { barcode: '7290014065153', name: 'ביסלי', brand: 'תלמה', category: 'Snacks' },
    { barcode: '7290014114455', name: 'במבה', brand: 'אוסם', category: 'Snacks' },
    { barcode: '7290014065204', name: 'ביסלי בייגלה', brand: 'תלמה', category: 'Snacks' },
    { barcode: '7290014114504', name: 'צ\'יפס', brand: 'תלמה', category: 'Snacks' },
    { barcode: '7290014065259', name: 'שוקולד חלב', brand: 'אלפא', category: 'Confectionery' },
    { barcode: '7290014114559', name: 'שוקולד מריר', brand: 'אלפא', category: 'Confectionery' },
    { barcode: '7290014065308', name: 'עוגיות שוקולד', brand: 'עלית', category: 'Confectionery' },
    { barcode: '7290014114608', name: 'עוגיות טבע', brand: 'עלית', category: 'Confectionery' },
    { barcode: '7290014065353', name: 'מים מינרליים 1.5 ל', brand: 'נביעות', category: 'Beverages' },
    { barcode: '7290014114653', name: 'קולה', brand: 'קוקה קולה', category: 'Beverages' },
    { barcode: '7290014065402', name: 'ספרייט', brand: 'קוקה קולה', category: 'Beverages' },
    { barcode: '7290014114702', name: 'מיץ תפוזים', brand: 'פריגת', category: 'Beverages' },
    { barcode: '7290014065457', name: 'מיץ תפוחים', brand: 'פריגת', category: 'Beverages' },
    { barcode: '7290014114757', name: 'קפה נמס', brand: 'נס קפה', category: 'Beverages' },
    { barcode: '7290014065506', name: 'תה', brand: 'ליפטון', category: 'Beverages' },
    { barcode: '7290014114806', name: 'בננות', brand: '', category: 'Fruits' },
    { barcode: '7290014065551', name: 'תפוחים', brand: '', category: 'Fruits' },
    { barcode: '7290014114851', name: 'עגבניות', brand: '', category: 'Vegetables' },
    { barcode: '7290014065600', name: 'מלפפונים', brand: '', category: 'Vegetables' },
    { barcode: '7290014114900', name: 'פלפלים', brand: '', category: 'Vegetables' },
    { barcode: '7290014065655', name: 'חצילים', brand: '', category: 'Vegetables' },
    { barcode: '7290014114955', name: 'צ\'יפס לבישול', brand: 'תלמה', category: 'Frozen' },
    { barcode: '7290014065704', name: 'גלידה וניל', brand: 'נסטלה', category: 'Frozen' },
    { barcode: '7290014115004', name: 'גלידה שוקולד', brand: 'נסטלה', category: 'Frozen' },
    { barcode: '7290014065759', name: 'לחמניות', brand: 'אחלה', category: 'Bakery' },
    { barcode: '7290014115103', name: 'בגט', brand: 'אחלה', category: 'Bakery' },
    { barcode: '7290014065808', name: 'פיתה', brand: 'אחלה', category: 'Bakery' },
  ];

  // Combine database products with common products
  const allProducts = [...dbProducts];
  const usedBarcodes = new Set(dbProducts.map(p => p.barcode));

  for (const commonProduct of commonProducts) {
    if (!usedBarcodes.has(commonProduct.barcode) && allProducts.length < count) {
      // Try to find in DB first, if not create it
      let product = await Product.findOne({ barcode: commonProduct.barcode });
      if (!product) {
        try {
          product = await Product.create({
            barcode: commonProduct.barcode,
            name: commonProduct.name,
            brand: commonProduct.brand || '',
            category: commonProduct.category || '',
            dataSource: 'manual',
          });
        } catch (error) {
          // If creation fails, skip
          continue;
        }
      }
      allProducts.push(product.toObject ? product.toObject() : product);
      usedBarcodes.add(commonProduct.barcode);
    }
  }

  return allProducts.slice(0, count);
}

/**
 * Generate random shopping list items from available products
 */
function generateShoppingList(products, itemCount = 50) {
  const shuffled = [...products].sort(() => 0.5 - Math.random());
  const selectedProducts = shuffled.slice(0, itemCount);
  
  return selectedProducts.map(product => ({
    name: product.name,
    quantity: Math.random() > 0.7 ? '2' : '1', // 30% chance of quantity 2
    product: product._id,
    barcode: product.barcode,
    isPurchased: Math.random() > 0.3, // 70% chance of being purchased
    addedBy: null, // Will be set when creating user
    createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000), // Random date in last 30 days
  }));
}

/**
 * Generate purchase history for a user based on their shopping list
 */
function generatePurchaseHistory(shoppingListItems, householdId, userId) {
  const purchaseHistory = [];
  const purchasedItems = shoppingListItems.filter(item => item.isPurchased);

  // For each purchased item, create 2-5 purchase records over time
  for (const item of purchasedItems) {
    const purchaseCount = Math.floor(Math.random() * 4) + 2; // 2-5 purchases
    const daysAgo = Math.floor(Math.random() * 90); // Within last 90 days

    for (let i = 0; i < purchaseCount; i++) {
      const purchaseDate = new Date(Date.now() - (daysAgo + i * 7) * 24 * 60 * 60 * 1000);
      purchaseHistory.push({
        household: householdId,
        user: userId,
        action: 'PURCHASE_ITEM',
        itemDetails: {
          name: item.name,
          quantity: item.quantity,
          product: item.product,
          barcode: item.barcode,
        },
        createdAt: purchaseDate,
      });
    }
  }

  return purchaseHistory;
}

/**
 * Main function to generate fake users
 */
async function generateFakeUsers() {
  try {
    await connectDB();
    console.log('🚀 Starting fake user generation...\n');

    // Get real products
    console.log('📦 Fetching real products...');
    const products = await getRealProducts(200); // Get more products to have variety
    console.log(`✅ Found ${products.length} products\n`);

    if (products.length < 50) {
      console.error('❌ Not enough products! Need at least 50 products.');
      process.exit(1);
    }

    const userCount = 100;
    const itemsPerUser = 50;

    console.log(`👥 Creating ${userCount} fake users with ${itemsPerUser} products each...\n`);

    // Delete existing fake users (optional - comment out if you want to keep existing data)
    // await User.deleteMany({ email: /^fakeuser\d+@example\.com$/ });
    // await Household.deleteMany({ name: /^Fake Household \d+$/ });

    const createdUsers = [];

    for (let i = 1; i <= userCount; i++) {
      try {
        // Create household
        const household = await Household.create({
          name: `Fake Household ${i}`,
        });

        // Create user with fake Firebase UID (for testing only)
        // Generate a UUID-like string for firebaseUid (required field)
        const fakeFirebaseUid = `fake_${i}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const user = await User.create({
          firebaseUid: fakeFirebaseUid,
          email: `fakeuser${i}@example.com`,
          displayName: `Fake User ${i}`,
          household: household._id,
        });

        // Generate shopping list
        const shoppingListItems = generateShoppingList(products, itemsPerUser);
        shoppingListItems.forEach(item => {
          item.addedBy = user._id;
        });

        // Create shopping list
        await ShoppingList.create({
          household: household._id,
          items: shoppingListItems,
        });

        // Generate purchase history
        const purchaseHistory = generatePurchaseHistory(shoppingListItems, household._id, user._id);
        if (purchaseHistory.length > 0) {
          await ChangeHistory.insertMany(purchaseHistory);
        }

        createdUsers.push({ userId: user._id, householdId: household._id });
        
        if (i % 10 === 0) {
          console.log(`✅ Created ${i}/${userCount} users...`);
        }
      } catch (error) {
        console.error(`❌ Error creating user ${i}:`, error.message);
        // Continue with next user
      }
    }

    console.log(`\n🎉 Successfully created ${createdUsers.length} fake users!`);
    console.log(`📊 Each user has ${itemsPerUser} products in their shopping list`);
    console.log(`📈 Purchase history has been generated for purchased items\n`);

    // Summary statistics
    const totalPurchases = await ChangeHistory.countDocuments({ action: 'PURCHASE_ITEM' });
    console.log(`📈 Total purchase records: ${totalPurchases}`);
    
    const uniqueProducts = await ChangeHistory.distinct('itemDetails.barcode', {
      action: 'PURCHASE_ITEM',
      'itemDetails.barcode': { $exists: true, $ne: null }
    });
    console.log(`🛒 Unique products purchased: ${uniqueProducts.length}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error generating fake users:', error);
    process.exit(1);
  }
}

// Run the script
generateFakeUsers();

