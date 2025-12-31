const jwt = require('jsonwebtoken'); // Use standard jwt for socket
const { JWT_SECRET } = require('../config/env');
const registerRoomHandlers = require('./room.handler');
const User = require('../models/User');

const setupSocket = (io) => {
  // Middleware for Auth
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      // Fetch full user from DB
      const user = await User.findById(decoded.id).select('displayName avatar role');
      if (!user) return next(new Error('User not found'));
      
      socket.user = { 
        id: decoded.id, 
        displayName: user.displayName, 
        avatar: user.avatar, 
        role: user.role 
      };
      next();
    } catch (err) {
      return next(new Error('Authentication error'));
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
