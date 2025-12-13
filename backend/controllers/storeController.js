const Store = require('../models/Store');
const StoreProduct = require('../models/StoreProduct');
const Product = require('../models/Product');

/**
 * @desc    Get all active stores
 * @route   GET /api/stores
 * @access  Public
 */
exports.getStores = async (req, res) => {
  try {
    const { lat, lng, maxDistance } = req.query;

    let query = { isActive: true };

    // If coordinates provided, find stores within maxDistance (in km)
    if (lat && lng) {
      const coordinates = [parseFloat(lng), parseFloat(lat)];
      const distance = maxDistance ? parseFloat(maxDistance) * 1000 : 50000; // Default 50km, convert to meters

      query.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: coordinates,
          },
          $maxDistance: distance,
        },
      };
    }

    const stores = await Store.find(query).sort({ name: 1 });

    res.status(200).json({
      success: true,
      stores: stores.map(s => s.toObject()),
      count: stores.length,
    });
  } catch (error) {
    console.error('Error in getStores:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * @desc    Create or update a store
 * @route   POST /api/stores
 * @access  Private (Admin only - you can add auth middleware later)
 */
exports.createStore = async (req, res) => {
  try {
    const {
      name,
      chain,
      address,
      location,
      phone,
      hours,
      website,
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Store name is required' });
    }

    if (!location || !location.coordinates || location.coordinates.length !== 2) {
      return res.status(400).json({ message: 'Valid location coordinates are required' });
    }

    const storeData = {
      name,
      chain,
      address,
      location: {
        type: 'Point',
        coordinates: [location.coordinates[0], location.coordinates[1]], // [lng, lat]
      },
      phone,
      hours,
      website,
    };

    // Format full address if address object provided
    if (address) {
      const parts = [];
      if (address.street) parts.push(address.street);
      if (address.city) parts.push(address.city);
      if (address.state) parts.push(address.state);
      if (address.zipCode) parts.push(address.zipCode);
      storeData.address.fullAddress = parts.join(', ');
    }

    const store = await Store.create(storeData);

    res.status(201).json({
      success: true,
      store: store.toObject(),
    });
  } catch (error) {
    console.error('Error in createStore:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * @desc    Get product prices across all stores
 * @route   GET /api/stores/prices/:productId
 * @access  Public
 */
exports.getProductPrices = async (req, res) => {
  try {
    const { productId } = req.params;
    const { lat, lng, maxDistance } = req.query;

    // Verify product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Build store filter if location provided
    let storeFilter = { isActive: true };
    if (lat && lng) {
      const coordinates = [parseFloat(lng), parseFloat(lat)];
      const distance = maxDistance ? parseFloat(maxDistance) * 1000 : 50000;

      storeFilter.location = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: coordinates,
          },
          $maxDistance: distance,
        },
      };
    }

    // Get stores
    const stores = await Store.find(storeFilter);
    const storeIds = stores.map(s => s._id);

    // Get prices for this product at these stores
    const storeProducts = await StoreProduct.find({
      product: productId,
      store: { $in: storeIds },
      isAvailable: true,
    })
      .populate('store', 'name chain address location')
      .sort({ price: 1 }); // Sort by price ascending

    res.status(200).json({
      success: true,
      product: product.toObject(),
      prices: storeProducts.map(sp => ({
        store: sp.store,
        price: sp.price,
        currency: sp.currency,
        unitPrice: sp.unitPrice,
        isAvailable: sp.isAvailable,
        inStock: sp.inStock,
        discount: sp.discount,
        lastPriceUpdate: sp.lastPriceUpdate,
      })),
      count: storeProducts.length,
    });
  } catch (error) {
    console.error('Error in getProductPrices:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * @desc    Update or create product price at a store
 * @route   POST /api/stores/:storeId/products/:productId/price
 * @access  Private (Admin or store manager)
 */
exports.updateProductPrice = async (req, res) => {
  try {
    const { storeId, productId } = req.params;
    const { price, currency, isAvailable, inStock, discount } = req.body;

    if (price === undefined || price === null) {
      return res.status(400).json({ message: 'Price is required' });
    }

    if (price < 0) {
      return res.status(400).json({ message: 'Price must be non-negative' });
    }

    // Verify store and product exist
    const [store, product] = await Promise.all([
      Store.findById(storeId),
      Product.findById(productId),
    ]);

    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Update or create StoreProduct
    const storeProduct = await StoreProduct.findOneAndUpdate(
      { store: storeId, product: productId },
      {
        price,
        currency: currency || 'USD',
        isAvailable: isAvailable !== undefined ? isAvailable : true,
        inStock: inStock !== undefined ? inStock : true,
        discount,
        lastPriceUpdate: new Date(),
        // Add to price history
        $push: {
          priceHistory: {
            price,
            date: new Date(),
          },
        },
      },
      { upsert: true, new: true }
    )
      .populate('store', 'name chain')
      .populate('product', 'name brand');

    res.status(200).json({
      success: true,
      storeProduct: storeProduct.toObject(),
    });
  } catch (error) {
    console.error('Error in updateProductPrice:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

