const jwt = require('jsonwebtoken'); // Use standard jwt for socket
const { JWT_SECRET } = require('../config/env');
const registerRoomHandlers = require('./room.handler');
const User = require('../models/User');

const setupSocket = (io) => {
  // Middleware for Auth
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      console.error('[Socket Auth] No token provided');
      return next(new Error('Authentication error: No token'));
    }

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      // Fetch full user from DB
      const user = await User.findById(decoded.id).select('displayName avatar role isPremium');
      if (!user) {
        console.error('[Socket Auth] User not found for id:', decoded.id);
        return next(new Error('User not found'));
      }

      socket.user = {
        id: decoded.id,
        displayName: user.displayName,
        avatar: user.avatar,
        role: user.role,
        isPremium: user.isPremium || false
      };
      next();
    } catch (err) {
      console.error('[Socket Auth] JWT verification failed:', err.message);
      return next(new Error('Authentication error: ' + err.message));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.id}`);

    // Register handlers
    registerRoomHandlers(io, socket);

    socket.on('disconnect', () => {
      console.log('User disconnected');
    });
  });
};

module.exports = setupSocket;
