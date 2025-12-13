const Product = require('../models/Product');
const { lookupBarcode, searchProducts } = require('../services/barcodeService');

/**
 * @desc    Lookup product by barcode
 * @route   GET /api/products/barcode/:barcode
 * @access  Public (or Private if you want to track usage)
 */
exports.lookupByBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;

    if (!barcode || barcode.trim().length === 0) {
      return res.status(400).json({ message: 'Barcode is required' });
    }

    const result = await lookupBarcode(barcode.trim());

    if (!result.success) {
      return res.status(404).json({
        message: result.message || 'Product not found',
      });
    }

    res.status(200).json({
      success: true,
      product: result.product,
      source: result.source,
    });
  } catch (error) {
    console.error('Error in lookupByBarcode:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * @desc    Search products by name
 * @route   GET /api/products/search?q=query
 * @access  Public
 */
exports.searchProducts = async (req, res) => {
  try {
    const { q, limit } = req.query;

    if (!q || q.trim().length === 0) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const result = await searchProducts(q.trim(), parseInt(limit) || 20);

    res.status(200).json({
      success: result.success,
      products: result.products,
      count: result.products.length,
    });
  } catch (error) {
    console.error('Error in searchProducts:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

/**
 * @desc    Get product by ID
 * @route   GET /api/products/:productId
 * @access  Public
 */
exports.getProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findById(productId);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json({
      success: true,
      product: product.toObject(),
    });
  } catch (error) {
    console.error('Error in getProduct:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

