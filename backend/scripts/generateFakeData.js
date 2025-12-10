/**
 * One-time data generator for Phase 2 (AI Prediction Engine)
 * - Inserts 100 fake households into your backend MongoDB using your existing Mongoose models.
 * - Each household gets 2-6 users, one ShoppingList (current list), and 50 historical baskets
 *   recorded as ChangeHistory entries (ADD_ITEM and PURCHASE_ITEM).
 *
 * Usage:
 *   cd backend
 *   npm install @faker-js/faker
 *   node scripts/generateFakeData.js
 *
 * Optional flag:
 *   --drop   : drop (delete) generated documents before creating new ones.
 *
 * Notes:
 * - This script expects your models are at backend/models/User.js, Household.js, ShoppingList.js, ChangeHistory.js
 * - It reads backend/.env for MONGO_URI (so you don't need to pass MONGO_URI on the command line).
 */
const mongoose = require('mongoose');
const { faker } = require('@faker-js/faker');
const path = require('path');

require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const User = require('../models/User');
const Household = require('../models/Household');
const ShoppingList = require('../models/ShoppingList');
const ChangeHistory = require('../models/ChangeHistory');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smart_shoping';
const DROP_BEFORE = process.argv.includes('--drop');

const ITEMS_POOL = [
  { name: 'Milk', category: 'Dairy' },
  { name: 'Eggs', category: 'Dairy' },
  { name: 'Bread', category: 'Bakery' },
  { name: 'Butter', category: 'Dairy' },
  { name: 'Cheese', category: 'Dairy' },
  { name: 'Apples', category: 'Produce' },
  { name: 'Bananas', category: 'Produce' },
  { name: 'Chicken', category: 'Meat' },
  { name: 'Rice', category: 'Pantry' },
  { name: 'Pasta', category: 'Pantry' },
  { name: 'Tomato', category: 'Produce' },
  { name: 'Onion', category: 'Produce' },
  { name: 'Potatoes', category: 'Produce' },
  { name: 'Coffee', category: 'Pantry' },
  { name: 'Sugar', category: 'Pantry' },
  { name: 'Salt', category: 'Pantry' },
  { name: 'Toilet Paper', category: 'Household' },
  { name: 'Shampoo', category: 'Personal Care' },
  { name: 'Soap', category: 'Personal Care' },
  { name: 'Orange Juice', category: 'Beverages' }
];

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomPastDate(daysBack) {
  const now = Date.now();
  const past = now - Math.floor(Math.random() * daysBack * 24 * 3600 * 1000);
  return new Date(past);
}

async function main() {
  console.log('Connecting to MongoDB...', MONGO_URI);
  await mongoose.connect(MONGO_URI);
  console.log('Connected.');

  if (DROP_BEFORE) {
    console.log('Dropping generated collections (Household, User, ShoppingList, ChangeHistory)...');
    try {
      await Household.deleteMany({});
      await User.deleteMany({});
      await ShoppingList.deleteMany({});
      await ChangeHistory.deleteMany({});
      console.log('Dropped existing docs.');
    } catch (err) {
      console.warn('Drop error (may be okay):', err.message);
    }
  }

  const TOTAL_HOUSEHOLDS = 100;
  const BASKETS_PER_HOUSEHOLD = 50;
  const MIN_USERS = 2;
  const MAX_USERS = 6;
  const MIN_ITEMS_PER_BASKET = 5;
  const MAX_ITEMS_PER_BASKET = 15;

  let createdHouseholds = 0;
  let createdUsers = 0;
  let createdHistories = 0;
  let createdLists = 0;

  for (let h = 0; h < TOTAL_HOUSEHOLDS; h++) {
    // Create household
    const householdName = `Household ${h + 1} - ${faker.word.noun()}`;
    const household = new Household({
      name: householdName,
      members: [],
      createdAt: new Date()
    });
    await household.save();

    // Create users for household (ensure required fields: firebaseUid, email, displayName, household)
    const userCount = randomInt(MIN_USERS, MAX_USERS);
    const householdUsers = [];
    for (let u = 0; u < userCount; u++) {
      const fullName = faker.person.fullName();
      const email = faker.internet.email({ firstName: fullName.split(' ')[0] }).toLowerCase();
      const firebaseUid = faker.string.uuid();
      const user = new User({
        firebaseUid,
        email,
        displayName: fullName,
        household: household._id
      });
      await user.save();
      householdUsers.push(user);
      household.members.push(user._id);
      createdUsers++;
    }
    await household.save();
    createdHouseholds++;

    // Create a single ShoppingList for this household (schema has household unique)
    const shoppingList = new ShoppingList({
      household: household._id,
      items: []
    });
    await shoppingList.save();
    createdLists++;

    // Generate historical baskets as ChangeHistory entries
    let lastBasketItems = [];
    for (let b = 0; b < BASKETS_PER_HOUSEHOLD; b++) {
      const itemCount = randomInt(MIN_ITEMS_PER_BASKET, MAX_ITEMS_PER_BASKET);
      const basketItems = [];

      for (let it = 0; it < itemCount; it++) {
        const poolItem = ITEMS_POOL[Math.floor(Math.random() * ITEMS_POOL.length)];
        const quantityNum = randomInt(1, 5);
        const quantityStr = `${quantityNum}`; // ShoppingList expects quantity as String
        const addedByUser = householdUsers[Math.floor(Math.random() * householdUsers.length)];
        const createdAt = randomPastDate(365);
        const purchased = Math.random() < 0.7; // 70% purchased
        const purchasedAt = purchased ? new Date(createdAt.getTime() + randomInt(0, 14) * 24 * 3600 * 1000) : null;
        const purchasedBy = purchased ? householdUsers[Math.floor(Math.random() * householdUsers.length)]._id : null;

        // Build item object for potential insertion into the current shopping list later
        const itemObj = {
          name: poolItem.name,
          quantity: quantityStr,
          category: poolItem.category,
          addedBy: addedByUser._id,
          isPurchased: purchased,
          createdAt
        };
        basketItems.push(itemObj);

        // Write Add history (use schema fields: household, user, action enum, itemDetails, createdAt)
        const historyAdd = new ChangeHistory({
          household: household._id,
          user: addedByUser._id,
          action: 'ADD_ITEM',
          itemDetails: { name: poolItem.name, quantity: quantityStr },
          createdAt: createdAt
        });
        await historyAdd.save();
        createdHistories++;

        // If purchased, write PURCHASE_ITEM history
        if (purchased) {
          const historyPurchase = new ChangeHistory({
            household: household._id,
            user: purchasedBy,
            action: 'PURCHASE_ITEM',
            itemDetails: { name: poolItem.name, quantity: quantityStr },
            createdAt: purchasedAt
          });
          await historyPurchase.save();
          createdHistories++;
        }
      } // end items in basket

      lastBasketItems = basketItems; // keep last basket to use as current list snapshot
    } // end baskets loop

    // Set the household's current shopping list items to the last basket (snapshot)
    shoppingList.items = lastBasketItems.map(it => ({
      name: it.name,
      quantity: it.quantity,
      addedBy: it.addedBy,
      isPurchased: false,
      createdAt: it.createdAt
    }));
    await shoppingList.save();

    if ((h + 1) % 10 === 0) {
      console.log(`Created ${h + 1}/${TOTAL_HOUSEHOLDS} households so far...`);
    }
  } // end households loop

  console.log('Generation complete:');
  console.log('- Households created:', createdHouseholds);
  console.log('- Users created:', createdUsers);
  console.log('- Shopping lists created:', createdLists);
  console.log('- ChangeHistory entries created:', createdHistories);

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
  process.exit(0);
}

main().catch(err => {
  console.error('Generator error:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});