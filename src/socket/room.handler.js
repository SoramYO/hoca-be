const Room = require('../models/Room');
const User = require('../models/User');
const { joinRoom, leaveRoom } = require('../services/room.service');
const subscriptionService = require('../services/subscription.service');
const { checkAndUnlockBadges } = require('../services/badge.service');


// Timer State Management
// roomId -> { timeout: NodeJS.Timeout, status, startTime, duration, mode, endTime }
const roomTimers = {};

// FREE User Daily Time Tracking - userId -> { checkInterval, roomId, socketId, lastCheck }
const freeUserTimeTrackers = {};

const TIMER_MODES = {
  'POMODORO_25_5': { focus: 25, break: 5 },
  'POMODORO_50_10': { focus: 50, break: 10 },
  'POMODORO_90_15': { focus: 90, break: 15 },
  'COUNT_UP': { focus: 0, break: 0 } // handled differently
};

const registerRoomHandlers = (io, socket) => {
  const userId = socket.user.id;

  // Helper: Clear FREE user time tracker
  const clearFreeUserTracker = (uid) => {
    if (freeUserTimeTrackers[uid]) {
      clearInterval(freeUserTimeTrackers[uid].checkInterval);
      delete freeUserTimeTrackers[uid];
    }
  };

  // Helper: Start FREE user daily time tracker
  // Checks every minute if user has exceeded daily limit
  const startFreeUserTimeTracker = async (uid, roomId, socketId) => {
    // Clear existing tracker
    clearFreeUserTracker(uid);

    const tierLimits = subscriptionService.getTierLimits('FREE');
    const dailyLimitMinutes = tierLimits.dailyStudyMinutes;
    const warningMinutes = tierLimits.warningBeforeKickMinutes;

    // Check every 30 seconds
    const checkInterval = setInterval(async () => {
      try {
        const user = await User.findById(uid);
        if (!user) {
          clearFreeUserTracker(uid);
          return;
        }

        const timeStatus = subscriptionService.getDailyStudyTimeStatus(user);

        // Send remaining time to client
        io.to(socketId).emit('time-status', {
          remainingMinutes: timeStatus.remainingMinutes,
          dailyLimitMinutes,
          shouldWarn: timeStatus.shouldWarn
        });

        // Warning (5 minutes before limit)
        if (timeStatus.shouldWarn && !freeUserTimeTrackers[uid]?.warningSent) {
          io.to(socketId).emit('session-warning', {
            message: `Bạn còn ${timeStatus.remainingMinutes} phút trong giới hạn ${dailyLimitMinutes / 60} giờ/ngày. Nâng cấp HOCA+ để học không giới hạn!`,
            remainingMinutes: timeStatus.remainingMinutes
          });

          io.to(socketId).emit('chat-message', {
            userId: 'system',
            displayName: 'System',
            message: `⚠️ Còn ${timeStatus.remainingMinutes} phút! Bạn sắp hết giới hạn học miễn phí hôm nay. Nâng cấp HOCA+ để học không giới hạn.`,
            timestamp: new Date().toISOString()
          });

          if (freeUserTimeTrackers[uid]) {
            freeUserTimeTrackers[uid].warningSent = true;
          }
        }

        // Time's up - kick user
        if (timeStatus.shouldKick) {
          // Force leave room
          try {
            await leaveRoom(roomId, uid);
          } catch (e) {
            console.error('Error leaving room on daily limit:', e);
          }

          // Notify the user
          io.to(socketId).emit('session-expired', {
            message: `Bạn đã sử dụng hết ${dailyLimitMinutes / 60} giờ học miễn phí hôm nay. Nâng cấp HOCA+ để học không giới hạn!`,
            reason: 'DAILY_LIMIT_REACHED'
          });

          // Emit leave to others
          io.to(roomId).emit('user-left', { userId: uid, socketId, reason: 'daily_limit' });

          // Force disconnect from room
          const targetSocket = io.sockets.sockets.get(socketId);
          if (targetSocket) {
            targetSocket.leave(roomId);
          }

          // Clear tracker
          clearFreeUserTracker(uid);

          console.log(`FREE user ${uid} kicked from room ${roomId} - daily limit reached`);
        }
      } catch (err) {
        console.error('Error in FREE user time tracker:', err);
      }
    }, 30000); // Check every 30 seconds

    freeUserTimeTrackers[uid] = {
      checkInterval,
      roomId,
      socketId,
      startTime: Date.now(),
      warningSent: false
    };

    console.log(`Started daily time tracker for FREE user ${uid}`);
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

      const result = await joinRoom(roomId, userId, password);

      socket.join(roomId);
      socket.to(roomId).emit('user-joined', {
        userId,
        socketId: socket.id,
        userInfo: {
          displayName: socket.user.displayName,
          avatar: socket.user.avatar,
          subscriptionTier: socket.user.subscriptionTier,
          rank: socket.user.rank
        }
      });

      // Send room info to the joining user (includes owner for close button)
      const room = await Room.findById(roomId).populate('owner', '_id displayName');
      const user = await User.findById(userId);

      if (room) {
        // Check mic permission for this user in this room
        const micPermission = user
          ? subscriptionService.checkMicPermission(user, room)
          : { canUseMic: false, hideMicIcon: true };

        socket.emit('room-info', {
          roomId: room._id,
          name: room.name,
          ownerId: room.owner?._id?.toString(),
          ownerName: room.owner?.displayName,
          maxParticipants: room.maxParticipants,
          isPublic: room.isPublic,
          timerMode: room.timerMode,
          // NEW: Room type and mic permission info
          roomType: room.roomType,
          micPermission: {
            canUseMic: micPermission.canUseMic,
            hideMicIcon: micPermission.hideMicIcon || false,
            showUpgrade: micPermission.showUpgrade || false,
            reason: micPermission.reason
          }
        });
      }

      // Start FREE user daily time tracker if applicable
      const tier = socket.user.subscriptionTier || 'FREE';
      if (tier === 'FREE' && socket.user.role !== 'ADMIN') {
        await startFreeUserTimeTracker(userId, roomId, socket.id);

        const tierLimits = subscriptionService.getTierLimits('FREE');

        // Send session info to client
        socket.emit('session-info', {
          tier: 'FREE',
          dailyLimitMinutes: tierLimits.dailyStudyMinutes,
          remainingMinutes: result.remainingMinutes,
          warningBeforeMinutes: tierLimits.warningBeforeKickMinutes,
          startTime: Date.now()
        });
      }

      // Sync Timer - if timer exists, sync it; if not, auto-start!
      if (roomTimers[roomId]) {
        const { status, startTime, duration, mode } = roomTimers[roomId];
        socket.emit('timer-sync', { status, startTime, duration, mode, serverTime: Date.now() });
      } else {
        // Auto-start timer for the room with default mode
        const roomForTimer = await Room.findById(roomId);
        const mode = roomForTimer?.timerMode || 'POMODORO_25_5';
        runTimerPhase(roomId, 'FOCUS', mode);
        console.log(`Auto-started timer for room ${roomId} with mode ${mode}`);
      }

      console.log(`User ${userId} (${tier}) joined room ${roomId}, roomType: ${room?.roomType}`);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  socket.on('leave-room', async ({ roomId }) => {
    // Clear FREE user tracker when leaving
    clearFreeUserTracker(userId);
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
    // Clear FREE user tracker on disconnect
    clearFreeUserTracker(userId);

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

      // Check and unlock badges after leaving room (study time was recorded)
      try {
        const result = await checkAndUnlockBadges(userId, io);
        if (result.newBadges && result.newBadges.length > 0) {
          console.log(`User ${userId} unlocked ${result.newBadges.length} new badge(s)`);
        }
      } catch (badgeErr) {
        console.error('Error checking badges on leave:', badgeErr);
      }

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
        avatar: socket.user.avatar,
        rank: socket.user.rank
      }
    });
  });

  socket.on('chat-message', async ({ roomId, message, content, type = 'TEXT', stickerId, mentions = [] }) => {
    // Chat only for MONTHLY, YEARLY, LIFETIME or ADMIN
    const tier = socket.user.subscriptionTier || 'FREE';
    const canChat = tier !== 'FREE' || socket.user.role === 'ADMIN';

    if (!canChat) {
      socket.emit('chat-error', { message: 'Tính năng chat chỉ dành cho gói HOCA+ Tháng trở lên. Nâng cấp ngay!' });
      return;
    }

    const displayName = socket.user.displayName || 'User';
    const msgContent = content || message; // Fallback

    try {
      // Save to DB for history
      const savedMessage = await Message.create({
        room: roomId,
        sender: userId,
        content: msgContent,
        type,
        stickerId,
        mentions
      });

      // Populate sender for consistency if needed, but we have user info in socket
      // Just broadcasting needed fields is faster
      
      io.to(roomId).emit('chat-message', {
        _id: savedMessage._id,
        userId,
        displayName,
        avatar: socket.user.avatar,
        message: msgContent, // Maintain 'message' field for frontend compatibility
        content: msgContent,
        type,
        stickerId,
        mentions,
        timestamp: savedMessage.createdAt
      });
    } catch (error) {
      console.error('Chat persistence error:', error);
      // Still emit even if save fails? Maybe better to warn.
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Media State Broadcast (camera/mic on/off)
  // Includes mic permission check for HOCA+ feature
  socket.on('media-state-update', async ({ roomId, isCameraOn, isMicOn }) => {
    try {
      // If user is trying to turn on mic, check permission
      if (isMicOn) {
        const room = await Room.findById(roomId);
        const user = await User.findById(userId);

        if (room && user) {
          const permission = subscriptionService.checkMicPermission(user, room);

          if (!permission.canUseMic) {
            // Block mic activation and notify user
            socket.emit('mic-blocked', {
              message: permission.reason,
              showUpgrade: permission.showUpgrade || false,
              roomType: room.roomType
            });

            // Don't broadcast mic-on to others
            socket.to(roomId).emit('media-state-update', {
              socketId: socket.id,
              userId: socket.user.id,
              isCameraOn,
              isMicOn: false // Force mic off in broadcast
            });
            return;
          }
        }
      }

      // Permission granted or mic is being turned off - broadcast normally
      socket.to(roomId).emit('media-state-update', {
        socketId: socket.id,
        userId: socket.user.id,
        isCameraOn,
        isMicOn
      });
    } catch (error) {
      console.error('Error in media-state-update:', error);
      // Fallback: allow broadcast but log error
      socket.to(roomId).emit('media-state-update', {
        socketId: socket.id,
        userId: socket.user.id,
        isCameraOn,
        isMicOn
      });
    }
  });

  // Request mic permission - client can call this to check before enabling mic
  socket.on('request-mic-permission', async ({ roomId }) => {
    try {
      const room = await Room.findById(roomId);
      const user = await User.findById(userId);

      if (!room || !user) {
        socket.emit('mic-permission-result', {
          canUseMic: false,
          reason: 'Room or user not found'
        });
        return;
      }

      const permission = subscriptionService.checkMicPermission(user, room);
      const tier = subscriptionService.getEffectiveTier(user);

      socket.emit('mic-permission-result', {
        canUseMic: permission.canUseMic,
        reason: permission.reason,
        showUpgrade: permission.showUpgrade || false,
        hideMicIcon: permission.hideMicIcon || false,
        roomType: room.roomType,
        userTier: tier
      });
    } catch (error) {
      socket.emit('mic-permission-result', {
        canUseMic: false,
        reason: 'Error checking permission'
      });
    }
  });
};

module.exports = registerRoomHandlers;
