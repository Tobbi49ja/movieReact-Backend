const User = require('../models/User');
const Comment = require('../models/Comment');
const Reaction = require('../models/Reaction');
const Watchlist = require('../models/Watchlist');
const Rating = require('../models/Rating');

// @desc    Get overall site stats
// @route   GET /api/admin/stats
// @access  Private/Admin
const getStats = async (req, res) => {
  try {
    const [users, comments, reactions, watchlistItems, ratings] = await Promise.all([
      User.countDocuments(),
      Comment.countDocuments(),
      Reaction.countDocuments(),
      Watchlist.countDocuments(),
      Rating.countDocuments(),
    ]);

    res.json({ users, comments, reactions, watchlistItems, ratings });
  } catch (err) {
    console.error('GetStats error:', err);
    res.status(500).json({ message: 'Server error fetching stats' });
  }
};

// @desc    Paginated list of all users (no passwords)
// @route   GET /api/admin/users?page=1&limit=20
// @access  Private/Admin
const getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find().select('-password').sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('GetUsers error:', err);
    res.status(500).json({ message: 'Server error fetching users' });
  }
};

// @desc    Delete a user by ID (cannot delete own account)
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (String(id) === String(req.user.id)) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ success: true, message: 'User deleted' });
  } catch (err) {
    console.error('DeleteUser error:', err);
    res.status(500).json({ message: 'Server error deleting user' });
  }
};

// @desc    Promote user to admin
// @route   PUT /api/admin/users/:id/promote
// @access  Private/Admin
const promoteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: 'admin' },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ success: true, message: 'User promoted to admin', user });
  } catch (err) {
    console.error('PromoteUser error:', err);
    res.status(500).json({ message: 'Server error promoting user' });
  }
};

// @desc    Demote user back to regular user
// @route   PUT /api/admin/users/:id/demote
// @access  Private/Admin
const demoteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: 'user' },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ success: true, message: 'User demoted to regular user', user });
  } catch (err) {
    console.error('DemoteUser error:', err);
    res.status(500).json({ message: 'Server error demoting user' });
  }
};

// @desc    Paginated list of all comments
// @route   GET /api/admin/comments?page=1&limit=20
// @access  Private/Admin
const getAllComments = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      Comment.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Comment.countDocuments(),
    ]);

    res.json({ comments, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error('GetAllComments error:', err);
    res.status(500).json({ message: 'Server error fetching comments' });
  }
};

// @desc    Delete any comment by ID
// @route   DELETE /api/admin/comments/:id
// @access  Private/Admin
const deleteComment = async (req, res) => {
  try {
    const comment = await Comment.findByIdAndDelete(req.params.id);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    res.json({ success: true, message: 'Comment deleted' });
  } catch (err) {
    console.error('DeleteComment error:', err);
    res.status(500).json({ message: 'Server error deleting comment' });
  }
};

// @desc    Reaction stats grouped by contentType
// @route   GET /api/admin/reactions
// @access  Private/Admin
const getReactionStats = async (req, res) => {
  try {
    const rows = await Reaction.aggregate([
      {
        $group: {
          _id: { contentType: '$contentType', reaction: '$reaction' },
          count: { $sum: 1 },
        },
      },
    ]);

    const stats = { movie: { like: 0, dislike: 0 }, tv: { like: 0, dislike: 0 } };
    rows.forEach((row) => {
      const { contentType, reaction } = row._id;
      if (stats[contentType] && stats[contentType][reaction] !== undefined) {
        stats[contentType][reaction] = row.count;
      }
    });

    res.json(stats);
  } catch (err) {
    console.error('GetReactionStats error:', err);
    res.status(500).json({ message: 'Server error fetching reaction stats' });
  }
};

module.exports = {
  getStats,
  getUsers,
  deleteUser,
  promoteUser,
  demoteUser,
  getAllComments,
  deleteComment,
  getReactionStats,
};
