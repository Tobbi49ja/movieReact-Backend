const express = require('express');
const router = express.Router();
const {
  getStats,
  getUsers,
  deleteUser,
  promoteUser,
  demoteUser,
  getAllComments,
  deleteComment,
  getReactionStats,
} = require('../controllers/admin.controller');
const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/adminOnly');

// All admin routes require a valid token AND admin role
router.use(protect, adminOnly);

router.get('/stats', getStats);
router.get('/users', getUsers);
router.delete('/users/:id', deleteUser);
router.put('/users/:id/promote', promoteUser);
router.put('/users/:id/demote', demoteUser);
router.get('/comments', getAllComments);
router.delete('/comments/:id', deleteComment);
router.get('/reactions', getReactionStats);

module.exports = router;
