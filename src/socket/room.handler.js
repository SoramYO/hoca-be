const Room = require('../models/Room');
const { joinRoom, leaveRoom } = require('../services/room.service');

// Timer State Management
// roomId -> { timeout: NodeJS.Timeout, status, startTime, duration, mode, endTime }
const roomTimers = {};

// FREE User Session Timers - userId -> { warningTimeout, kickTimeout, roomId, socketId }
const freeUserSessionTimers = {};

// FREE tier limits (in milliseconds)
const FREE_SESSION_DURATION = 60 * 60 * 1000; // 60 minutes
const FREE_SESSION_WARNING = 5 * 60 * 1000; // 5 minute warning before kick

const TIMER_MODES = {
  'POMODORO_25_5': { focus: 25, break: 5 },
  'POMODORO_50_10': { focus: 50, break: 10 },
  'POMODORO_90_15': { focus: 90, break: 15 },
  'COUNT_UP': { focus: 0, break: 0 } // handled differently
};

const registerRoomHandlers = (io, socket) => {
  const userId = socket.user.id;

  // Helper: Clear FREE user session timers
  const clearFreeUserTimers = (uid) => {
    if (freeUserSessionTimers[uid]) {
      clearTimeout(freeUserSessionTimers[uid].warningTimeout);
      clearTimeout(freeUserSessionTimers[uid].kickTimeout);
      delete freeUserSessionTimers[uid];
    }
  };

  // Helper: Start FREE user session timer
  const startFreeUserSessionTimer = (uid, roomId, socketId) => {
    // Clear existing timers
    clearFreeUserTimers(uid);

    const warningTime = FREE_SESSION_DURATION - FREE_SESSION_WARNING;

    // Warning timeout (55 minutes)
    const warningTimeout = setTimeout(() => {
      io.to(socketId).emit('session-warning', {
        message: 'Bạn còn 5 phút trong phiên học miễn phí. Nâng cấp HOCA+ để học không giới hạn!',
        remainingMinutes: 5
      });

      // Also send as system chat message
      io.to(socketId).emit('chat-message', {
        userId: 'system',
        displayName: 'System',
        message: '⚠️ Còn 5 phút! Phiên học miễn phí sắp kết thúc. Nâng cấp HOCA+ để học không giới hạn.',
        timestamp: new Date().toISOString()
      });
    }, warningTime);

    // Kick timeout (60 minutes)
    const kickTimeout = setTimeout(async () => {
      // Force leave room
      try {
        await leaveRoom(roomId, uid);
      } catch (e) {
        console.error('Error leaving room on session timeout:', e);
      }

      // Notify the user they've been kicked
      io.to(socketId).emit('session-expired', {
        message: 'Phiên học miễn phí 60 phút đã kết thúc. Nâng cấp HOCA+ để học không giới hạn!',
        reason: 'FREE_SESSION_LIMIT'
      });

      // Emit leave to others
      io.to(roomId).emit('user-left', { userId: uid, socketId, reason: 'session_expired' });

      // Force disconnect from room
      const targetSocket = io.sockets.sockets.get(socketId);
      if (targetSocket) {
        targetSocket.leave(roomId);
      }

      // Clear timers
      clearFreeUserTimers(uid);

      console.log(`FREE user ${uid} auto-kicked from room ${roomId} after 60 minutes`);
    }, FREE_SESSION_DURATION);

    freeUserSessionTimers[uid] = {
      warningTimeout,
      kickTimeout,
      roomId,
      socketId,
      startTime: Date.now()
    };

    console.log(`Started 60-minute session timer for FREE user ${uid}`);
  };

  // Helper to switch phases
  const runTimerPhase = (roomId, phase, modeKey) => {
    const config = TIMER_MODES[modeKey] || TIMER_MODES['POMODORO_25_5'];
    const duration = phase === 'FOCUS' ? config.focus : config.break;

    if (!duration) return; // Should not happen for valid modes logic

    const startTime = Date.now();
    const endTime = startTime + duration * 60 * 1000;

    // Update State
    if (roomTimers[roomId]) {
      clearTimeout(roomTimers[roomId].timeout);
    }

    roomTimers[roomId] = {
      status: phase, // 'FOCUS' or 'BREAK'
      startTime,
      duration,
      mode: modeKey,
      endTime,
      timeout: setTimeout(() => {
        // Phase Complete! Switch!
        const nextPhase = phase === 'FOCUS' ? 'BREAK' : 'FOCUS';
        runTimerPhase(roomId, nextPhase, modeKey);
      }, duration * 60 * 1000)
    };

    // Broadcast Update
    io.to(roomId).emit('timer-update', {
      status: phase,
      startTime,
      duration,
      mode: modeKey,
      serverTime: Date.now()
    });

    // Optional: Notify Chat
    const message = phase === 'FOCUS'
      ? '🔔 Focus Time Started! Good luck!'
      : '☕ Break Time! Relax for a bit.';

    io.to(roomId).emit('chat-message', {
      userId: 'system',
      displayName: 'System',
      message,
      timestamp: new Date().toISOString()
    });
  };

  socket.on('join-room', async ({ roomId, password }) => {
    try {
      if (!roomId) throw new Error('Room ID is required');

      await joinRoom(roomId, userId, password);

      socket.join(roomId);
      socket.to(roomId).emit('user-joined', {
        userId,
        socketId: socket.id,
        userInfo: {
          displayName: socket.user.displayName,
          avatar: socket.user.avatar,
          subscriptionTier: socket.user.subscriptionTier
        }
      });

      // Start FREE user session timer if applicable
      const tier = socket.user.subscriptionTier || 'FREE';
      if (tier === 'FREE' && socket.user.role !== 'ADMIN') {
        startFreeUserSessionTimer(userId, roomId, socket.id);

        // Send session info to client
        socket.emit('session-info', {
          tier: 'FREE',
          sessionDurationMinutes: 60,
          warningAtMinutes: 55,
          startTime: Date.now()
        });
      }

      // Sync Timer - if timer exists, sync it; if not, auto-start!
      if (roomTimers[roomId]) {
        const { status, startTime, duration, mode } = roomTimers[roomId];
        socket.emit('timer-sync', { status, startTime, duration, mode, serverTime: Date.now() });
      } else {
        // Auto-start timer for the room with default mode
        const room = await Room.findById(roomId);
        const mode = room?.timerMode || 'POMODORO_25_5';
        runTimerPhase(roomId, 'FOCUS', mode);
        console.log(`Auto-started timer for room ${roomId} with mode ${mode}`);
      }

      console.log(`User ${userId} (${tier}) joined room ${roomId}`);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('leave-room', async ({ roomId }) => {
    // Clear FREE user timers when leaving
    clearFreeUserTimers(userId);
    await handleLeave(roomId);
  });

  // Ghost Mode for Admin (Silent Join)
  socket.on('admin-join-room', async ({ roomId }) => {
    try {
      if (socket.user.role !== 'ADMIN') throw new Error('Unauthorized');

      socket.join(roomId);
      console.log(`Admin ${socket.user.id} spectating room ${roomId}`);

      if (roomTimers[roomId]) {
        const { status, startTime, duration, mode } = roomTimers[roomId];
        socket.emit('timer-sync', { status, startTime, duration, mode, serverTime: Date.now() });
      }
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('disconnecting', () => {
    const rooms = [...socket.rooms];
    rooms.forEach(roomId => {
      if (roomId !== socket.id) handleLeave(roomId);
    });
  });

  const handleLeave = async (roomId) => {
    try {
      await leaveRoom(roomId, userId);
      socket.leave(roomId);
      socket.to(roomId).emit('user-left', { userId, socketId: socket.id });

      // Note: We do NOT stop the timer if users leave. 
      // It continues running as long as the server is up (or until explicit stop).
    } catch (err) {
      console.error(err);
    }
  };

  // Timer Controls
  socket.on('timer-start', async ({ roomId }) => {
    // Determine mode from DB
    try {
      const room = await Room.findById(roomId);
      if (!room) return;

      // Default or Custom mode
      const mode = room.timerMode || 'POMODORO_25_5';

      // Start Loop
      runTimerPhase(roomId, 'FOCUS', mode);

    } catch (e) {
      console.error('Failed to start timer', e);
    }
  });

  // Explicit Stop (Optional, maybe for closing room)
  socket.on('timer-stop', ({ roomId }) => {
    if (roomTimers[roomId]) {
      clearTimeout(roomTimers[roomId].timeout);
      delete roomTimers[roomId];
      io.to(roomId).emit('timer-update', { status: 'IDLE' });
    }
  });

  // Change timer mode - syncs to all users in room
  socket.on('timer-mode-change', ({ roomId, mode }) => {
    // Validate mode
    const validModes = ['POMODORO_25_5', 'POMODORO_50_10', 'POMODORO_90_15'];
    if (!validModes.includes(mode)) {
      mode = 'POMODORO_25_5';
    }

    console.log(`User ${socket.user.displayName} changed timer mode to ${mode} in room ${roomId}`);

    // Restart timer with new mode (resets to FOCUS phase with new duration)
    runTimerPhase(roomId, 'FOCUS', mode);

    // Notify room
    io.to(roomId).emit('chat-message', {
      userId: 'system',
      displayName: 'System',
      message: `🔄 ${socket.user.displayName} đã đổi chế độ Pomodoro thành ${mode.replace('POMODORO_', '').replace('_', '/')}`,
      timestamp: new Date().toISOString()
    });
  });

  socket.on('signal', ({ roomId, signal, to }) => {
    io.to(to).emit('signal', {
      signal,
      from: socket.id,
      userInfo: {
        userId: socket.user.id,
        displayName: socket.user.displayName,
        avatar: socket.user.avatar
      }
    });
  });

  socket.on('chat-message', ({ roomId, message }) => {
    // Chat only for MONTHLY, YEARLY, LIFETIME or ADMIN
    const tier = socket.user.subscriptionTier || 'FREE';
    const canChat = tier !== 'FREE' || socket.user.role === 'ADMIN';

    if (!canChat) {
      socket.emit('chat-error', { message: 'Tính năng chat chỉ dành cho gói HOCA+ Tháng trở lên. Nâng cấp ngay!' });
      return;
    }

    const displayName = socket.user.displayName || 'User';
    io.to(roomId).emit('chat-message', {
      userId,
      displayName,
      message,
      timestamp: new Date().toISOString()
    });
  });

  // Media State Broadcast (camera/mic on/off)
  socket.on('media-state-update', ({ roomId, isCameraOn, isMicOn }) => {
    socket.to(roomId).emit('media-state-update', {
      socketId: socket.id,
      userId: socket.user.id,
      isCameraOn,
      isMicOn
    });
  });
};

module.exports = registerRoomHandlers;
