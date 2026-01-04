const jwt = require('jsonwebtoken'); // Use standard jwt for socket
const { JWT_SECRET } = require('../config/env');
const registerRoomHandlers = require('./room.handler');
const User = require('../models/User');

const { calculateUserRank } = require('../services/rank.service');

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
      const user = await User.findById(decoded.id).select('displayName avatar role subscriptionTier subscriptionExpiry totalStudyMinutes isLocked isBlocked');
      if (!user) {
        console.error('[Socket Auth] User not found for id:', decoded.id);
        return next(new Error('User not found'));
      }

      if (user.isLocked || user.isBlocked) {
        console.error('[Socket Auth] User blocked/locked:', decoded.id);
        return next(new Error('Account locked'));
      }

      // Calculate effective tier (check expiry for MONTHLY/YEARLY)
      let effectiveTier = user.subscriptionTier || 'FREE';
      if (effectiveTier !== 'FREE' && effectiveTier !== 'LIFETIME') {
        if (user.subscriptionExpiry && new Date(user.subscriptionExpiry) < new Date()) {
          effectiveTier = 'FREE';
        }
      }

      // Calculate Rank
      let userRank = null;
      try {
        userRank = await calculateUserRank(user.totalStudyMinutes || 0);
      } catch (rankErr) {
        console.error('Error calculating rank for socket user:', rankErr);
      }

      socket.user = {
        id: decoded.id,
        displayName: user.displayName,
        avatar: user.avatar,
        role: user.role,
        subscriptionTier: effectiveTier,
        rank: userRank,
        // Backward compat: isPremium = true if tier is not FREE
        isPremium: effectiveTier !== 'FREE'
      };
      next();
    } catch (err) {
      console.error('[Socket Auth] JWT verification failed:', err.message);
      return next(new Error('Authentication error: ' + err.message));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.id} | Socket ID: ${socket.id}`);

    // Send initial connection confirmation
    socket.emit('connected', {
      userId: socket.user.id,
      socketId: socket.id,
      timestamp: new Date()
    });

    // Register handlers
    registerRoomHandlers(io, socket);

    // Handle manual ping from client
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });

    socket.on('disconnect', (reason) => {
      console.log(`User disconnected: ${socket.user.id} | Reason: ${reason}`);
    });

    socket.on('error', (error) => {
      console.error(`Socket error for user ${socket.user.id}:`, error);
    });
  });
};

module.exports = setupSocket;
