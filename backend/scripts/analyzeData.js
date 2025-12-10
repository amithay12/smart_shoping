const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const ChangeHistory = require('../models/ChangeHistory');

async function analyze() {
  console.log('--- 🕵️‍♂️ SHERLOCK HOLMES (WIDE SEARCH) STARTED 🕵️‍♂️ ---');
  await mongoose.connect(process.env.MONGO_URI);

  // Aggregation: Group by Household + MONTH (to catch items bought weeks apart)
  const baskets = await ChangeHistory.aggregate([
    { $match: { action: 'PURCHASE_ITEM' } },
    {
      $group: {
        _id: {
          household: "$household",
          // Grouping by MONTH (YYYY-mm) catches the 14-day random spread
          month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }
        },
        items: { $addToSet: "$itemDetails.name" }
      }
    },
    // Filter out baskets with only 1 item
    { $match: { $expr: { $gt: [{ $size: "$items" }, 1] } } }
  ]);

  console.log(`Processing ${baskets.length} monthly shopping groups...`);

  const coOccurrence = {}; 
  const itemCounts = {};

  baskets.forEach(basket => {
    const items = basket.items;
    
    // Count individual occurrences
    items.forEach(item => {
      itemCounts[item] = (itemCounts[item] || 0) + 1;
    });

    // Count pairs
    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < items.length; j++) {
        if (i === j) continue;
        const itemA = items[i];
        const itemB = items[j];

        if (!coOccurrence[itemA]) coOccurrence[itemA] = {};
        coOccurrence[itemA][itemB] = (coOccurrence[itemA][itemB] || 0) + 1;
      }
    }
  });

  const results = [];
  Object.keys(coOccurrence).forEach(itemA => {
    const mates = coOccurrence[itemA];
    const totalTimesBought = itemCounts[itemA];

    Object.keys(mates).forEach(itemB => {
      const timesTogether = mates[itemB];
      const confidence = (timesTogether / totalTimesBought) * 100;

      // Lowered threshold to 10% to find patterns in random data
      if (confidence > 10 && totalTimesBought > 10) { 
        results.push({
          trigger: itemA,
          recommendation: itemB,
          confidence: confidence.toFixed(1),
          details: `${timesTogether}/${totalTimesBought}`
        });
      }
    });
  });

  results.sort((a, b) => parseFloat(b.confidence) - parseFloat(a.confidence));

  console.log('\n--- 🎯 TOP AI PREDICTIONS (Weak & Strong) ---');
  if (results.length === 0) console.log("No patterns found.");
  
  // Print top 30
  results.slice(0, 30).forEach(r => {
    console.log(`[${r.trigger}] -> [${r.recommendation}] (${r.confidence}% confidence)`);
  });

  await mongoose.disconnect();
}

analyze();