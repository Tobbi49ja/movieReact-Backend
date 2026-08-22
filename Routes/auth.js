const express = require('express');
const router = express.Router();
const { register, login, getMe, updateAvatar } = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');

// Public
router.post('/register', register);
router.post('/login', login);

// Protected
router.get('/me', protect, getMe);
router.put('/avatar', protect, updateAvatar);

module.exports = router;
