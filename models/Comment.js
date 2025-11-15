const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    contentId: { type: String, required: true }, // movieId or tvId
    contentType: { type: String, enum: ['movie', 'tv'], required: true },
    username: { type: String, required: true },
    comment: { type: String, required: true },
    likes: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Comment', commentSchema);
