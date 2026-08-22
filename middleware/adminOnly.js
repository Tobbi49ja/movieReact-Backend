const User = require('../models/User');

// Admin-only middleware — runs AFTER protect.
// Checks the DB role (JWT payload only carries { id, iat, exp }).
const adminOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('role');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access only' });
    }
    req.user.role = user.role;
    next();
  } catch (err) {
    console.error('AdminOnly error:', err);
    res.status(500).json({ message: 'Server error checking admin access' });
  }
};

module.exports = { adminOnly };
