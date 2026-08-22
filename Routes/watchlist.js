const express = require('express');
const router = express.Router();
const {
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  checkWatchlist,
} = require('../controllers/watchlist.controller');
const { protect } = require('../middleware/auth');

// All watchlist routes are protected
router.get('/', protect, getWatchlist);
router.post('/', protect, addToWatchlist);
router.get('/check/:tmdbId', protect, checkWatchlist);
router.delete('/:tmdbId', protect, removeFromWatchlist);

module.exports = router;
