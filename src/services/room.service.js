const Room = require('../models/Room');
const StudySession = require('../models/StudySession');
const User = require('../models/User');
const SystemConfig = require('../models/SystemConfig');
const subscriptionService = require('./subscription.service');

// Helper: Get config with default
const getConfig = async (key, defaultVal) => {
  return await SystemConfig.getValue(key, defaultVal);
};

// Helper: Check if same day
const isSameDay = (date1, date2) => {
  if (!date1 || !date2) return false;
  return date1.getDate() === date2.getDate() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getFullYear() === date2.getFullYear();
};

// Helper: Reset user's daily stats if new day
const resetDailyStatsIfNeeded = async (user) => {
  const now = new Date();
  if (!isSameDay(user.lastRoomDate, now)) {
    user.todayRoomMinutes = 0;
    user.todaySessionCount = 0;
    user.lastRoomDate = now;
  }
  if (!isSameDay(user.lastRoomCreatedDate, now)) {
    user.todayRoomCreatedCount = 0;
    user.lastRoomCreatedDate = now;
  }
  await user.save();
};

const createRoom = async (userId, roomData) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  // Reset daily stats if new day
  await resetDailyStatsIfNeeded(user);

  // Determine room type (default SILENT, only HOCA+ can create DISCUSSION)
  let roomType = roomData.roomType || 'SILENT';

  // Check room creation eligibility (includes roomType validation)
  const eligibility = subscriptionService.checkRoomCreationEligibility(user, roomType);
  if (!eligibility.canCreate) {
    throw new Error(eligibility.reason);
  }

  const tier = subscriptionService.getEffectiveTier(user);
  const tierLimits = subscriptionService.getTierLimits(tier);

  // Force SILENT for FREE users (safety check)
  if (tier === 'FREE' && roomType === 'DISCUSSION') {
    roomType = 'SILENT';
  }

  // Respect user's maxParticipants selection, but cap it at the tier's limit
  const tierMaxParticipants = tier === 'FREE' ? 30 : 999;
  const userRequestedMax = roomData.maxParticipants || 4;
  const maxParticipants = Math.min(userRequestedMax, tierMaxParticipants);

  // Calculate autoCloseAt for FREE tier rooms
  let autoCloseAt = null;
  if (tierLimits.roomDurationMinutes !== Infinity) {
    autoCloseAt = new Date(Date.now() + tierLimits.roomDurationMinutes * 60 * 1000);
  }

  const room = await Room.create({
    ...roomData,
    roomType,
    maxParticipants,
    owner: userId,
    isActive: true,
    autoCloseAt,
    ownerTierAtCreation: tier
  });

  // Update user's room creation tracking
  user.todayRoomCreatedCount = (user.todayRoomCreatedCount || 0) + 1;
  user.lastRoomCreatedDate = new Date();

  // For FREE tier, track active personal room (sequential requirement)
  if (tierLimits.requireSequentialRooms) {
    user.activePersonalRoomId = room._id;
  }

  await user.save();

  console.log(`Room created by ${user.displayName} (${tier}): ${room._id}, type: ${roomType}, autoCloseAt: ${autoCloseAt}`);

  return room;
};

/**
 * Close a room and clear owner's activePersonalRoomId
 * @param {string} roomId 
 * @param {string} reason - Reason for closing ('manual', 'auto_expired', 'admin')
 */
const closeRoom = async (roomId, reason = 'manual') => {
  const room = await Room.findById(roomId);
  if (!room) throw new Error('Room not found');
  if (!room.isActive) return { message: 'Room already closed' };

  room.isActive = false;
  room.closedAt = new Date();
  await room.save();

  // Clear owner's activePersonalRoomId if this was their active room
  if (room.owner) {
    const owner = await User.findById(room.owner);
    if (owner && owner.activePersonalRoomId?.toString() === roomId.toString()) {
      owner.activePersonalRoomId = null;
      await owner.save();
    }
  }

  // End all active sessions in this room
  await StudySession.updateMany(
    { room: roomId, endTime: null },
    { $set: { endTime: new Date(), isCompleted: true } }
  );

  // Clear currentRoomId for all participants
  await User.updateMany(
    { currentRoomId: roomId },
    { $set: { currentRoomId: null } }
  );

  console.log(`Room ${roomId} closed. Reason: ${reason}`);

  return { message: 'Room closed', reason };
};

const getPublicRooms = async (query = {}) => {
  // Can add pagination and filtering here
  return await Room.find({
    isPublic: true,
    isActive: true,
    ...query
  })
    .populate('owner', 'displayName avatar')
    .populate('category', 'name')
    .select('-password');
};

const getRoomById = async (roomId) => {
  const room = await Room.findById(roomId)
    .populate('owner', 'displayName avatar')
    .populate('activeParticipants', 'displayName avatar');
  if (!room) throw new Error('Room not found');
  return room;
};

const joinRoom = async (roomId, userId, password) => {
  const cleanId = roomId.trim();
  console.log('Service joinRoom called:', { roomId: cleanId, userId });

  // Get user first for all checks
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  if (user.isLocked || user.isBlocked) {
    throw new Error('Tài khoản của bạn đang bị khóa. Vui lòng liên hệ quản trị viên.');
  }

  // Reset daily stats if new day
  await resetDailyStatsIfNeeded(user);

  // === RESTRICTION 1: Single Room Participation (System-wide) ===
  if (user.currentRoomId && user.currentRoomId.toString() !== cleanId) {
    throw new Error('Bạn đang ở trong một phòng khác. Vui lòng rời phòng trước khi tham gia phòng mới.');
  }

  // === RESTRICTION 2: Check join eligibility based on daily study time ===
  const joinEligibility = subscriptionService.checkJoinRoomEligibility(user);
  if (!joinEligibility.canJoin) {
    throw new Error(joinEligibility.reason);
  }

  let room;
  try {
    room = await Room.findById(cleanId);
  } catch (e) {
    throw new Error(`Invalid Room ID format: ${cleanId}`);
  }

  if (!room) {
    console.log('Service joinRoom: Room not found');
    throw new Error(`Room not found: ${cleanId}`);
  }
  if (!room.isActive) {
    throw new Error('Phòng này đã đóng hoặc không còn hoạt động.');
  }

  // Check Password
  if (!room.isPublic) {
    if (room.password !== password && room.owner.toString() !== userId) {
      throw new Error('Invalid room password');
    }
  }

  const tier = subscriptionService.getEffectiveTier(user);

  // Check Capacity
  if (room.activeParticipants.length >= room.maxParticipants) {
    const alreadyJoined = room.activeParticipants.some(id => id.toString() === userId.toString());
    if (!alreadyJoined) {
      const premiumMessage = tier === 'FREE' && room.maxParticipants === 30
        ? ' Nâng cấp HOCA+ để tạo phòng không giới hạn thành viên!'
        : '';
      throw new Error(`Phòng đã đầy (${room.maxParticipants} người).${premiumMessage}`);
    }
  }

  // Add to active participants
  await Room.findByIdAndUpdate(cleanId, {
    $addToSet: { activeParticipants: userId }
  });

  // === Set user's currentRoomId and session tracking ===
  const now = new Date();

  user.currentRoomId = cleanId;
  user.currentSessionStartTime = now;
  user.lastRoomDate = now;

  await user.save();

  // Start Study Session
  let session = await StudySession.findOne({ user: userId, room: roomId, endTime: null });
  if (!session) {
    session = await StudySession.create({
      user: userId,
      room: roomId,
      startTime: new Date()
    });
  }

  // Get remaining time info for FREE users
  const timeStatus = subscriptionService.getDailyStudyTimeStatus(user);

  return {
    room,
    session,
    remainingMinutes: timeStatus.remainingMinutes
  };
};

const leaveRoom = async (roomId, userId) => {
  const room = await Room.findById(roomId);
  if (room) {
    room.activeParticipants = room.activeParticipants.filter(id => id.toString() !== userId);
    await room.save();
  }

  // End Session
  const session = await StudySession.findOne({ user: userId, room: roomId, endTime: null });
  if (session) {
    session.endTime = new Date();
    const duration = (session.endTime - session.startTime) / 60000; // minutes
    session.duration = Math.floor(duration);
    session.isCompleted = true;
    await session.save();

    // Update User Stats (async)
    await updateUserStats(userId, session.duration);
  }

  // === Clear user's currentRoomId and update todayRoomMinutes ===
  const user = await User.findById(userId);
  if (user) {
    user.currentRoomId = null;
    user.currentSessionStartTime = null;
    if (session) {
      user.todayRoomMinutes = (user.todayRoomMinutes || 0) + (session.duration || 0);
    }
    await user.save();
  }

  return { message: 'Left room' };
};

const updateUserStats = async (userId, minutes) => {
  try {
    const user = await User.findById(userId);
    if (!user) return;

    user.totalStudyMinutes += minutes;
    // Streak logic would go here (or in a job)
    user.lastStudyDate = new Date();
    await user.save();
  } catch (err) {
    console.error('Error updating stats', err);
  }
};

/**
 * Get rooms that need to be auto-closed (expired FREE tier rooms)
 */
const getExpiredRooms = async () => {
  return await Room.find({
    isActive: true,
    autoCloseAt: { $lte: new Date() }
  }).populate('owner', 'displayName');
};

const getUserRooms = async (userId) => {
  return await Room.find({
    owner: userId,
    isActive: true
  })
    .populate('owner', 'displayName avatar')
    .populate('category', 'name')
    .sort('-createdAt');
};

module.exports = {
  createRoom,
  closeRoom,
  getPublicRooms,
  getRoomById,
  joinRoom,
  joinRoom,
  leaveRoom,
  getExpiredRooms,
  getUserRooms
};
