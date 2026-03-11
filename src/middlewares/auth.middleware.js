const User = require('../models/User');

const protect = async (req, reply) => {
  try {
    await req.jwtVerify();

    // Fetch full user object after JWT is verified
    // This ensures req.user has both .id and ._id for compatibility
    const user = await User.findById(req.user.id);
    if (!user) {
      return reply.code(401).send({ message: 'User not found' });
    }

    // Check if user is locked/blocked
    // This ensures locked users are immediately denied access even with valid tokens
    if (user.isLocked || user.isBlocked) {
      return reply.code(403).send({
        message: 'Tài khoản của bạn đã bị khóa',
        lockReason: user.lockReason || 'Vi phạm quy định cộng đồng'
      });
    }

    // Set full user object on request (includes _id, role, subscriptionTier, etc.)
    req.user = user;
  } catch (err) {
    reply.send(err);
  }
};

const admin = async (req, reply) => {
  if (req.user && req.user.role === 'ADMIN') {
    // Authorized
  } else {
    reply.code(403).send({ message: 'Not authorized as admin' });
  }
};

module.exports = {
  protect,
  admin
};
