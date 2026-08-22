const express = require('express');
const router = express.Router();
const {
  getRating,
  getAverageRating,
  submitRating,
  deleteRating,
} = require('../controllers/rating.controller');
const { protect } = require('../middleware/auth');

// Public
router.get('/:tmdbId', getAverageRating);

// Protected
router.get('/:tmdbId/me', protect, getRating);
router.post('/', protect, submitRating);
router.delete('/:tmdbId', protect, deleteRating);

module.exports = router;
