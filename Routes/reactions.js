const express = require('express');
const router = express.Router();
const Reaction = require('../models/Reaction');

// -----------------------------
// GET counts + this device's reaction
// GET /api/reactions/:contentType/:contentId?deviceId=xxx
// -----------------------------
router.get('/:contentType/:contentId', async (req, res) => {
  const { contentType, contentId } = req.params;
  const { deviceId } = req.query;

  try {
    const [likes, dislikes, userDoc] = await Promise.all([
      Reaction.countDocuments({ contentId, contentType, reaction: 'like' }),
      Reaction.countDocuments({ contentId, contentType, reaction: 'dislike' }),
      deviceId
        ? Reaction.findOne({ contentId, contentType, deviceId })
        : Promise.resolve(null),
    ]);

    res.json({
      likes,
      dislikes,
      userReaction: userDoc ? userDoc.reaction : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching reactions' });
  }
});

// -----------------------------
// POST toggle reaction
// POST /api/reactions
// body: { contentId, contentType, deviceId, reaction: 'like'|'dislike' }
// sending the same reaction again removes it (toggle)
// -----------------------------
router.post('/', async (req, res) => {
  const { contentId, contentType, deviceId, reaction } = req.body;

  if (!contentId || !contentType || !deviceId || !reaction) {
    return res.status(400).json({ message: 'Missing required fields' });
  }

  try {
    const existing = await Reaction.findOne({ contentId, contentType, deviceId });

    if (existing) {
      if (existing.reaction === reaction) {
        // Same reaction clicked again → remove it
        await existing.deleteOne();
      } else {
        // Switched reaction (like → dislike or vice versa)
        existing.reaction = reaction;
        await existing.save();
      }
    } else {
      // First time reacting
      await Reaction.create({ contentId, contentType, deviceId, reaction });
    }

    // Return updated counts + new user reaction
    const [likes, dislikes, userDoc] = await Promise.all([
      Reaction.countDocuments({ contentId, contentType, reaction: 'like' }),
      Reaction.countDocuments({ contentId, contentType, reaction: 'dislike' }),
      Reaction.findOne({ contentId, contentType, deviceId }),
    ]);

    res.json({
      likes,
      dislikes,
      userReaction: userDoc ? userDoc.reaction : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error saving reaction' });
  }
});

module.exports = router;
