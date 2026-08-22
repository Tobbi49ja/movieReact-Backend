const mongoose = require('mongoose');

const ratingSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    tmdbId: { type: Number, required: true },
    mediaType: { type: String, enum: ['movie', 'tv'], required: true },
    score: { type: Number, min: 1, max: 5, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// One rating per user per title — enforced at DB level
ratingSchema.index({ userId: 1, tmdbId: 1, mediaType: 1 }, { unique: true });

module.exports = mongoose.model('Rating', ratingSchema);
