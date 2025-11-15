const express = require('express');
const router = express.Router();
const Comment = require('../models/Comment');

// ✅ Get all comments for a content
router.get('/:contentType/:contentId', async (req, res) => {
  const { contentId, contentType } = req.params;
  try {
    const comments = await Comment.find({ contentId, contentType }).sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching comments' });
  }
});

// ✅ Add a new comment
router.post('/', async (req, res) => {
  const { contentId, contentType, comment, username } = req.body;
  if (!contentId || !comment || !username || !contentType) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const newComment = new Comment({
      contentId,
      contentType,
      username,
      comment,
    });

    const savedComment = await newComment.save();
    res.status(201).json(savedComment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error saving comment' });
  }
});

// ✅ Like a comment
router.post('/like/:commentId', async (req, res) => {
  const { commentId } = req.params;
  try {
    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    comment.likes += 1;
    const updatedComment = await comment.save();

    res.json(updatedComment); // frontend will broadcast via Socket.io
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error liking comment' });
  }
});

module.exports = router;
