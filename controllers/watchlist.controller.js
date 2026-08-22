const Watchlist = require('../models/Watchlist');

// @desc    Get all watchlist items for current user
// @route   GET /api/watchlist
// @access  Private
const getWatchlist = async (req, res) => {
  try {
    const items = await Watchlist.find({ userId: req.user.id }).sort({ addedAt: -1 });
    res.json(items);
  } catch (err) {
    console.error('GetWatchlist error:', err);
    res.status(500).json({ message: 'Server error fetching watchlist' });
  }
};

// @desc    Add item to watchlist
// @route   POST /api/watchlist
// @access  Private
const addToWatchlist = async (req, res) => {
  try {
    const { tmdbId, mediaType, title, poster } = req.body;

    if (!tmdbId || !mediaType) {
      return res.status(400).json({ message: 'tmdbId and mediaType are required' });
    }
    if (!['movie', 'tv'].includes(mediaType)) {
      return res.status(400).json({ message: 'mediaType must be movie or tv' });
    }

    const existing = await Watchlist.findOne({
      userId: req.user.id,
      tmdbId: Number(tmdbId),
      mediaType,
    });

    if (existing) {
      return res.status(409).json({ message: 'Already in watchlist' });
    }

    const item = await Watchlist.create({
      userId: req.user.id,
      tmdbId: Number(tmdbId),
      mediaType,
      title,
      poster,
    });

    res.status(201).json(item);
  } catch (err) {
    console.error('AddToWatchlist error:', err);
    res.status(500).json({ message: 'Server error adding to watchlist' });
  }
};

// @desc    Remove item from watchlist
// @route   DELETE /api/watchlist/:tmdbId?mediaType=movie|tv
// @access  Private
const removeFromWatchlist = async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { mediaType } = req.query;

    if (!mediaType) {
      return res.status(400).json({ message: 'mediaType query param is required' });
    }

    const item = await Watchlist.findOneAndDelete({
      userId: req.user.id,
      tmdbId: Number(tmdbId),
      mediaType,
    });

    if (!item) {
      return res.status(404).json({ message: 'Item not found in watchlist' });
    }

    res.json({ success: true, message: 'Removed from watchlist' });
  } catch (err) {
    console.error('RemoveFromWatchlist error:', err);
    res.status(500).json({ message: 'Server error removing from watchlist' });
  }
};

// @desc    Check if item is in user's watchlist
// @route   GET /api/watchlist/check/:tmdbId?mediaType=movie|tv
// @access  Private
const checkWatchlist = async (req, res) => {
  try {
    const { tmdbId } = req.params;
    const { mediaType } = req.query;

    if (!mediaType) {
      return res.status(400).json({ message: 'mediaType query param is required' });
    }

    const item = await Watchlist.findOne({
      userId: req.user.id,
      tmdbId: Number(tmdbId),
      mediaType,
    });

    res.json({ inWatchlist: Boolean(item) });
  } catch (err) {
    console.error('CheckWatchlist error:', err);
    res.status(500).json({ message: 'Server error checking watchlist' });
  }
};

module.exports = { getWatchlist, addToWatchlist, removeFromWatchlist, checkWatchlist };
