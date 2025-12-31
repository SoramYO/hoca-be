const Room = require('../models/Room');
const { joinRoom, leaveRoom } = require('../services/room.service');

// Timer State Management
// roomId -> { timeout: NodeJS.Timeout, status, startTime, duration, mode, endTime }
const roomTimers = {};

const TIMER_MODES = {
  'POMODORO_25_5': { focus: 25, break: 5 },
  'POMODORO_45_5': { focus: 45, break: 5 },
  'POMODORO_50_10': { focus: 50, break: 10 },
  'COUNT_UP': { focus: 0, break: 0 } // handled differently
};

const registerRoomHandlers = (io, socket) => {
  const userId = socket.user.id;

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
          avatar: socket.user.avatar
        }
      });

      // Sync Timer
      if (roomTimers[roomId]) {
        const { status, startTime, duration, mode } = roomTimers[roomId];
        socket.emit('timer-sync', { status, startTime, duration, mode, serverTime: Date.now() });
      }

      console.log(`User ${userId} joined room ${roomId}`);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('leave-room', async ({ roomId }) => {
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
    // Pro-only chat restriction
    if (!socket.user.isPremium && socket.user.role !== 'ADMIN') {
      socket.emit('chat-error', { message: 'Tính năng chat chỉ dành cho người dùng Pro. Nâng cấp ngay!' });
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
