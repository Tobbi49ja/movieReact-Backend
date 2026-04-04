const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema(
  {
    contentId:   { type: String, required: true },
    contentType: { type: String, enum: ['movie', 'tv'], required: true },
    deviceId:    { type: String, required: true },
    reaction:    { type: String, enum: ['like', 'dislike'], required: true },
  },
  { timestamps: true }
);

// One reaction per device per content — enforced at DB level
reactionSchema.index({ contentId: 1, contentType: 1, deviceId: 1 }, { unique: true });

module.exports = mongoose.model('Reaction', reactionSchema);
