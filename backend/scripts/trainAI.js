const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ChangeHistory = require('../models/ChangeHistory');
const Household = require('../models/Household');
const User = require('../models/User');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smart_shoping';

async function trainAI() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);

  // 1. Get any real household/user to assign these records to
  // (It doesn't matter who, because the Global AI looks at EVERYONE)
  const household = await Household.findOne();
  const user = await User.findOne({ household: household._id });

  if (!household || !user) {
    console.error('Error: No households found. Run the fake generator first!');
    process.exit(1);
  }

  console.log(`Training AI with pattern: "Batman" + "Robin"...`);

  // 2. Create 10 fake purchase events
  for (let i = 0; i < 10; i++) {
    const date = new Date();
    // Shift date back by 'i' days so they aren't all identical timestamps
    date.setDate(date.getDate() - i); 

    // Batman bought
    await ChangeHistory.create({
      household: household._id,
      user: user._id,
      action: 'PURCHASE_ITEM',
      itemDetails: { name: 'Batman', quantity: '1' },
      createdAt: date
    });

    // Robin bought (SAME TIME)
    await ChangeHistory.create({
      household: household._id,
      user: user._id,
      action: 'PURCHASE_ITEM',
      itemDetails: { name: 'Robin', quantity: '1' },
      createdAt: date
    });
  }

  console.log('✅ Training complete! The AI now believes that "Batman" and "Robin" are best friends.');
  await mongoose.disconnect();
}

trainAI();