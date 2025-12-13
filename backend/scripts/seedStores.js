/**
 * Seed Script: Create Sample Stores
 * Run with: node scripts/seedStores.js
 * 
 * This creates sample stores for testing the price comparison feature
 */

require('dotenv').config({ path: './.env' });
const mongoose = require('mongoose');
const Store = require('../models/Store');

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected');
  } catch (error) {
    console.error('Error connecting to MongoDB:', error.message);
    process.exit(1);
  }
};

// Israeli Supermarkets - Real stores in Israel
const sampleStores = [
  {
    name: 'שופרסל - Shufersal',
    chain: 'Shufersal',
    address: {
      street: 'רחוב דיזנגוף 50',
      city: 'תל אביב',
      state: 'תל אביב',
      zipCode: '64332',
      country: 'Israel',
      fullAddress: 'רחוב דיזנגוף 50, תל אביב',
    },
    location: {
      type: 'Point',
      coordinates: [34.7818, 32.0853], // [lng, lat] - Tel Aviv coordinates
    },
    phone: '+972-3-123-4567',
    website: 'https://www.shufersal.co.il',
    isActive: true,
  },
  {
    name: 'רמי לוי - Rami Levy',
    chain: 'Rami Levy',
    address: {
      street: 'רחוב הרצל 20',
      city: 'ירושלים',
      state: 'ירושלים',
      zipCode: '91000',
      country: 'Israel',
      fullAddress: 'רחוב הרצל 20, ירושלים',
    },
    location: {
      type: 'Point',
      coordinates: [35.2137, 31.7683], // [lng, lat] - Jerusalem coordinates
    },
    phone: '+972-2-234-5678',
    website: 'https://www.ramilevy.co.il',
    isActive: true,
  },
  {
    name: 'יוחננוף - Yohananof',
    chain: 'Yohananof',
    address: {
      street: 'רחוב בן יהודה 30',
      city: 'חיפה',
      state: 'חיפה',
      zipCode: '31000',
      country: 'Israel',
      fullAddress: 'רחוב בן יהודה 30, חיפה',
    },
    location: {
      type: 'Point',
      coordinates: [34.9896, 32.7940], // [lng, lat] - Haifa coordinates
    },
    phone: '+972-4-345-6789',
    website: 'https://www.yohananof.co.il',
    isActive: true,
  },
  {
    name: 'ויקטורי - Victory',
    chain: 'Victory',
    address: {
      street: 'רחוב ויצמן 15',
      city: 'רמת גן',
      state: 'רמת גן',
      zipCode: '52520',
      country: 'Israel',
      fullAddress: 'רחוב ויצמן 15, רמת גן',
    },
    location: {
      type: 'Point',
      coordinates: [34.8140, 32.0809], // [lng, lat] - Ramat Gan coordinates
    },
    phone: '+972-3-456-7890',
    website: 'https://www.victory.co.il',
    isActive: true,
  },
  // Additional stores in Tel Aviv area for better testing
  {
    name: 'שופרסל - Shufersal',
    chain: 'Shufersal',
    address: {
      street: 'רחוב אבן גבירול 100',
      city: 'תל אביב',
      state: 'תל אביב',
      zipCode: '64239',
      country: 'Israel',
      fullAddress: 'רחוב אבן גבירול 100, תל אביב',
    },
    location: {
      type: 'Point',
      coordinates: [34.7833, 32.0853], // [lng, lat] - Tel Aviv (different location)
    },
    phone: '+972-3-123-4568',
    website: 'https://www.shufersal.co.il',
    isActive: true,
  },
  {
    name: 'רמי לוי - Rami Levy',
    chain: 'Rami Levy',
    address: {
      street: 'רחוב רוטשילד 40',
      city: 'תל אביב',
      state: 'תל אביב',
      zipCode: '65781',
      country: 'Israel',
      fullAddress: 'רחוב רוטשילד 40, תל אביב',
    },
    location: {
      type: 'Point',
      coordinates: [34.7815, 32.0662], // [lng, lat] - Tel Aviv
    },
    phone: '+972-3-234-5679',
    website: 'https://www.ramilevy.co.il',
    isActive: true,
  },
];

async function seedStores() {
  try {
    await connectDB();

    console.log('🌱 Seeding stores...');

    // Clear existing stores (optional - comment out if you want to keep existing)
    // await Store.deleteMany({});
    // console.log('Cleared existing stores');

    // Insert stores
    const createdStores = [];
    for (const storeData of sampleStores) {
      // Check if store already exists
      const existing = await Store.findOne({ 
        name: storeData.name,
        'address.fullAddress': storeData.address.fullAddress 
      });

      if (existing) {
        console.log(`⏭️  Store "${storeData.name}" already exists, skipping...`);
        createdStores.push(existing);
      } else {
        const store = await Store.create(storeData);
        console.log(`✅ Created store: ${store.name}`);
        createdStores.push(store);
      }
    }

    console.log(`\n✨ Seeding complete! Created/Found ${createdStores.length} stores`);
    console.log('\nStores:');
    createdStores.forEach(store => {
      console.log(`  - ${store.name} (${store.address.city})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding stores:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedStores();
}

module.exports = seedStores;

