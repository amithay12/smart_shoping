const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const xml2js = require('xml2js');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreProduct = require('../models/StoreProduct');

// XML content from user
const yohananofXML = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <ChainId>7290803800003</ChainId>
  <SubChainId>000</SubChainId>
  <StoreId>005</StoreId>
  <BikoretNo>8</BikoretNo>
  <DllVerNo>1</DllVerNo>
  <Items Count="1">
    <Item>
      <PriceUpdateDate>2025-12-17 09:48</PriceUpdateDate>
      <ItemCode>611745285685</ItemCode>
      <ItemType>1</ItemType>
      <ItemName>אבוקדו בשל ארוז  יחי</ItemName>
      <ManufacturerName>משתנה</ManufacturerName>
      <ManufactureCountry />
      <ManufacturerItemDescription>אבוקדו בשל ארוז  יחי</ManufacturerItemDescription>
      <UnitQty>Unknown</UnitQty>
      <Quantity>0.00</Quantity>
      <bIsWeighted>0</bIsWeighted>
      <UnitOfMeasure>Unknown</UnitOfMeasure>
      <QtyInPackage>0</QtyInPackage>
      <ItemPrice>9.90</ItemPrice>
      <UnitOfMeasurePrice>9.90</UnitOfMeasurePrice>
      <AllowDiscount>1</AllowDiscount>
      <ItemStatus>1</ItemStatus>
    </Item>
  </Items>
</root>`;

// Rami Levy XML is too long, we'll parse it from a file or handle it separately
// For now, let's create a function to parse and import

async function parseAndImportXML(xmlContent, supermarketName) {
  try {
    const parser = new xml2js.Parser({
      explicitArray: false,
      mergeAttrs: true,
      trim: true,
      explicitRoot: true,
    });

    const parsed = await parser.parseStringPromise(xmlContent);
    
    // Handle both <root> and <Root>
    const root = parsed.root || parsed.Root;
    if (!root) {
      console.error(`No root element found for ${supermarketName}`);
      return 0;
    }

    // Get items - handle both lowercase and uppercase
    let items = [];
    if (root.Items) {
      if (root.Items.Item) {
        items = Array.isArray(root.Items.Item) ? root.Items.Item : [root.Items.Item];
      } else if (root.Items['$'] && root.Items['$'].Count === '0') {
        console.log(`  ⚠️  Empty file for ${supermarketName}`);
        return 0;
      }
    }

    if (items.length === 0) {
      console.log(`  ⚠️  No items found for ${supermarketName}`);
      return 0;
    }

    console.log(`  📦 Found ${items.length} products in XML`);

    // Get or create store
    let store = await Store.findOne({ chain: supermarketName });
    if (!store) {
      store = await Store.create({
        name: `${supermarketName} - Main Store`,
        chain: supermarketName,
        address: {
          fullAddress: 'Israel',
        },
        location: {
          type: 'Point',
          coordinates: [34.7818, 32.0853],
        },
        isActive: true,
      });
    }

    let saved = 0;
    for (const item of items) {
      try {
        const barcode = item.ItemCode || item.ItemCode || '';
        const name = item.ItemName || '';
        const price = parseFloat(item.ItemPrice || item.ItemPrice || 0);

        if (!barcode || !name || !price || price <= 0) {
          continue;
        }

        // Get or create product
        let product = await Product.findOne({ barcode });
        if (!product) {
          product = await Product.create({
            barcode,
            name,
            brand: item.ManufacturerName || '',
            category: '',
            dataSource: 'government',
          });
        }

        // Save price
        await StoreProduct.findOneAndUpdate(
          { product: product._id, store: store._id },
          {
            price,
            currency: 'ILS',
            unitPrice: price,
            isAvailable: true,
            inStock: true,
            lastPriceUpdate: new Date(item.PriceUpdateDate || Date.now()),
            $push: {
              priceHistory: {
                price,
                date: new Date(),
              },
            },
          },
          { upsert: true, new: true }
        );

        saved++;
      } catch (error) {
        console.error(`  ❌ Error saving item: ${error.message}`);
        continue;
      }
    }

    return saved;
  } catch (error) {
    console.error(`Error parsing XML for ${supermarketName}:`, error.message);
    return 0;
  }
}

async function importFiles() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Import Yohananof
    console.log('📥 Importing Yohananof prices...');
    const yohananofCount = await parseAndImportXML(yohananofXML, 'Yohananof');
    console.log(`  ✅ Saved ${yohananofCount} products for Yohananof\n`);

    // For Rami Levy, we need to read from a file or the user needs to provide it
    // For now, let's create a placeholder
    console.log('📥 Rami Levy file needs to be provided separately\n');

    console.log('✅ Import complete!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

importFiles();













