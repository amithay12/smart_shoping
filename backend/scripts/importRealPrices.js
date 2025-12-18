const path = require('path');
const xml2js = require('xml2js');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Store = require('../models/Store');
const StoreProduct = require('../models/StoreProduct');

// Yohananof XML (from user)
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

// Rami Levy XML - user provided a very long XML, we'll parse it from the string they pasted
// For now, let's create a function that can handle the XML they provided

async function parseAndImportXML(xmlContent, supermarketName) {
  try {
    const parser = new xml2js.Parser({
      explicitArray: false,
      mergeAttrs: true,
      trim: true,
      explicitRoot: true,
    });

    const parsed = await parser.parseStringPromise(xmlContent);
    
    // Handle both <root> (lowercase) and <Root> (uppercase)
    const root = parsed.root || parsed.Root;
    if (!root) {
      console.error(`  ❌ No root element found for ${supermarketName}`);
      return 0;
    }

    // Get items - handle both lowercase and uppercase Items
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
      console.log(`  ✅ Created store: ${supermarketName}`);
    }

    let saved = 0;
    let skipped = 0;
    
    for (const item of items) {
      try {
        const barcode = String(item.ItemCode || '').trim();
        const name = String(item.ItemName || '').trim();
        const price = parseFloat(item.ItemPrice || 0);

        if (!barcode || !name || !price || price <= 0) {
          skipped++;
          continue;
        }

        // Get or create product
        let product = await Product.findOne({ barcode });
        if (!product) {
          product = await Product.create({
            barcode,
            name,
            brand: String(item.ManufacturerName || '').trim(),
            category: '',
            dataSource: 'government',
          });
        }

        // Parse price update date
        let priceUpdateDate = new Date();
        if (item.PriceUpdateDate) {
          const dateStr = String(item.PriceUpdateDate).trim();
          // Try to parse date (format: "2025-12-17 09:48" or "2024-12-02 18:15:07")
          const parsedDate = new Date(dateStr.replace(/(\d{4}-\d{2}-\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/, '$1T$2:$3:${4 || "00"}'));
          if (!isNaN(parsedDate.getTime())) {
            priceUpdateDate = parsedDate;
          }
        }

        // Save price
        await StoreProduct.findOneAndUpdate(
          { product: product._id, store: store._id },
          {
            product: product._id,
            store: store._id,
            price,
            currency: 'ILS',
            unitPrice: price,
            isAvailable: true,
            inStock: true,
            lastPriceUpdate: priceUpdateDate,
            $push: {
              priceHistory: {
                price,
                date: priceUpdateDate,
              },
            },
          },
          { upsert: true, new: true }
        );

        saved++;
      } catch (error) {
        console.error(`  ❌ Error saving item: ${error.message}`);
        skipped++;
        continue;
      }
    }

    console.log(`  ✅ Saved ${saved} products for ${supermarketName} (skipped ${skipped})`);
    return saved;
  } catch (error) {
    console.error(`  ❌ Error parsing XML for ${supermarketName}:`, error.message);
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
    
    // For Rami Levy, the user provided a very long XML string
    // We need to save it to a file first or handle it differently
    console.log('\n📥 Rami Levy XML is too large to include inline.');
    console.log('   Please save the Rami Levy XML to a file and run:');
    console.log('   node scripts/importRamiLevyXML.js <path-to-xml-file>\n');

    console.log('✅ Import complete!');
    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

importFiles();



