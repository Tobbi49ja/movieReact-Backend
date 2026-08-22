const mongoose = require('mongoose');

const watchlistSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tmdbId: { type: Number, required: true },
    mediaType: { type: String, enum: ['movie', 'tv'], required: true },
    title: { type: String },
    poster: { type: String }, // poster_path URL
    addedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// One entry per user per title — enforced at DB level
watchlistSchema.index({ userId: 1, tmdbId: 1, mediaType: 1 }, { unique: true });

module.exports = mongoose.model('Watchlist', watchlistSchema);
