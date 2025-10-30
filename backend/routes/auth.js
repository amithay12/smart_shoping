const express = require('express');
const router = express.Router();

// We will import our controller functions here
const authController = require('../controllers/authController');

// Define the API endpoints

// @route   POST /api/auth/register-or-login
// @desc    Register a new user or log in an existing one
// @access  Public
router.post('/register-or-login', authController.registerOrLoginUser);

// We will add more routes here later (e.g., get user data)

module.exports = router;
