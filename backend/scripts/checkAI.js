const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const ChangeHistory = require('../models/ChangeHistory');

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  
  // 1. Check if we have Batman purchases
  const batmans = await ChangeHistory.find({ 'itemDetails.name': 'Batman' });
  console.log(`Found ${batmans.length} Batman purchases.`);

  // 2. Check if we have Robin purchases
  const robins = await ChangeHistory.find({ 'itemDetails.name': 'Robin' });
  console.log(`Found ${robins.length} Robin purchases.`);

  await mongoose.disconnect();
}
check();