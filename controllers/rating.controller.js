const Rating = require('../models/Rating');

// @desc    Get current user's rating for a title
// @route   GET /api/ratings/:tmdbId/me?mediaType=movie|tv
// @access  Private
const getRating = async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { mediaType = 'movie' } = req.query;

    const rating = await Rating.findOne({
      userId: req.user.id,
      tmdbId: Number(tmdbId),
      mediaType,
    });

    res.json({ rating: rating ? rating.score : null });
  } catch (err) {
    console.error('GetRating error:', err);
    res.status(500).json({ message: 'Server error fetching rating' });
  }
};

// @desc    Get average score + count for a title
// @route   GET /api/ratings/:tmdbId?mediaType=movie|tv
// @access  Public
const getAverageRating = async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { mediaType = 'movie' } = req.query;

    const [result] = await Rating.aggregate([
      { $match: { tmdbId: Number(tmdbId), mediaType } },
      {
        $group: {
          _id: null,
          average: { $avg: '$score' },
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      average: result ? Number(result.average.toFixed(1)) : 0,
      count: result ? result.count : 0,
    });
  } catch (err) {
    console.error('GetAverageRating error:', err);
    res.status(500).json({ message: 'Server error fetching average rating' });
  }
};

// @desc    Create or update user's rating for a title
// @route   POST /api/ratings
// @access  Private
const submitRating = async (req, res) => {
  try {
    const { tmdbId, mediaType, score } = req.body;

    if (!tmdbId || !mediaType || !score) {
      return res.status(400).json({ message: 'tmdbId, mediaType and score are required' });
    }
    if (!['movie', 'tv'].includes(mediaType)) {
      return res.status(400).json({ message: 'mediaType must be movie or tv' });
    }
    const numScore = Number(score);
    if (numScore < 1 || numScore > 5) {
      return res.status(400).json({ message: 'Score must be between 1 and 5' });
    }

    const rating = await Rating.findOneAndUpdate(
      { userId: req.user.id, tmdbId: Number(tmdbId), mediaType },
      { score: numScore },
      { upsert: true, new: true, runValidators: true }
    );

    res.json({ rating: rating.score });
  } catch (err) {
    console.error('SubmitRating error:', err);
    res.status(500).json({ message: 'Server error saving rating' });
  }
};

// @desc    Delete user's rating for a title
// @route   DELETE /api/ratings/:tmdbId?mediaType=movie|tv
// @access  Private
const deleteRating = async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { mediaType = 'movie' } = req.query;

    const rating = await Rating.findOneAndDelete({
      userId: req.user.id,
      tmdbId: Number(tmdbId),
      mediaType,
    });

    if (!rating) {
      return res.status(404).json({ message: 'Rating not found' });
    }

    res.json({ success: true, message: 'Rating removed' });
  } catch (err) {
    console.error('DeleteRating error:', err);
    res.status(500).json({ message: 'Server error deleting rating' });
  }
};

module.exports = { getRating, getAverageRating, submitRating, deleteRating };
