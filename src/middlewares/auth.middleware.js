const User = require('../models/User');

const protect = async (req, reply) => {
  try {
    await req.jwtVerify();

    // Check if user is locked/blocked after JWT is verified
    // This ensures locked users are immediately denied access even with valid tokens
    const user = await User.findById(req.user.id).select('isLocked isBlocked lockReason').lean();
    if (!user) {
      return reply.code(401).send({ message: 'User not found' });
    }

    if (user.isLocked || user.isBlocked) {
      return reply.code(403).send({
        message: 'Tài khoản của bạn đã bị khóa',
        lockReason: user.lockReason || 'Vi phạm quy định cộng đồng'
      });
    }
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
