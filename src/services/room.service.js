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

// Helper: Reset user's daily room minutes if new day
const resetDailyRoomMinutesIfNeeded = async (user) => {
  const now = new Date();
  if (!isSameDay(user.lastRoomDate, now)) {
    user.todayRoomMinutes = 0;
    user.todaySessionCount = 0; // Also reset session count
    user.lastRoomDate = now;
    await user.save();
  }
};

// Helper to check room ownership limit
const canCreateRoom = async (userId) => {
  const user = await User.findById(userId);
  if (!user) return false;
  if (user.role === 'ADMIN') return true;

  // Get room limit based on tier
  const roomLimit = subscriptionService.getRoomLimit(user);

  // Count owned rooms (not daily, but total owned)
  const ownedRoomCount = await Room.countDocuments({
    owner: userId,
    isActive: true
  });

  return ownedRoomCount < roomLimit;
};

const createRoom = async (userId, roomData) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const canCreate = await canCreateRoom(userId);
  if (!canCreate) {
    const roomLimit = subscriptionService.getRoomLimit(user);
    const tier = subscriptionService.getEffectiveTier(user);

    if (tier === 'FREE') {
      throw new Error(`Bạn đã đạt giới hạn ${roomLimit} phòng cho tài khoản miễn phí. Nâng cấp HOCA+ để tạo thêm phòng!`);
    } else if (tier === 'MONTHLY') {
      throw new Error(`Bạn đã đạt giới hạn ${roomLimit} phòng cho gói Tháng. Nâng cấp HOCA+ Năm để tạo không giới hạn!`);
    }
    throw new Error('Đã đạt giới hạn số phòng');
  }

  // Set maxParticipants based on tier
  const tier = subscriptionService.getEffectiveTier(user);
  const maxParticipants = tier === 'FREE' ? 30 : 999; // Effectively unlimited for premium

  const room = await Room.create({
    ...roomData,
    maxParticipants,
    owner: userId,
    isActive: true
  });

  return room;
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

  // === RESTRICTION 1: Single Room Participation (System-wide) ===
  if (user.currentRoomId && user.currentRoomId.toString() !== cleanId) {
    throw new Error('Bạn đang ở trong một phòng khác. Vui lòng rời phòng trước khi tham gia phòng mới.');
  }

  // === RESTRICTION 2: Subscription-based limits ===
  const tier = subscriptionService.getEffectiveTier(user);

  if (tier === 'FREE') {
    await resetDailyRoomMinutesIfNeeded(user);

    // Check session count limit (2 per day for FREE)
    const sessionEligibility = subscriptionService.checkFreeUserSessionEligibility(user);
    if (!sessionEligibility.canJoin) {
      throw new Error(sessionEligibility.reason);
    }

    // Check total daily time limit
    const freeDailyLimit = await getConfig('freeDailyStudyMinutes', 120); // 2 sessions x 60 mins
    if (user.todayRoomMinutes >= freeDailyLimit) {
      throw new Error(`Bạn đã đạt giới hạn ${freeDailyLimit} phút học miễn phí hôm nay. Nâng cấp HOCA+ để học không giới hạn!`);
    }
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
    throw new Error('Room is inactive');
  }

  // Check Password
  if (!room.isPublic) {
    if (room.password !== password && room.owner.toString() !== userId) {
      throw new Error('Invalid room password');
    }
  }

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
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  user.currentRoomId = cleanId;
  user.currentSessionStartTime = now;

  // Update session count for FREE users
  if (tier === 'FREE') {
    const lastSessionDate = user.lastSessionDate ? new Date(user.lastSessionDate) : null;
    const isNewDay = !lastSessionDate || lastSessionDate < today;

    if (isNewDay) {
      user.todaySessionCount = 1;
    } else {
      user.todaySessionCount = (user.todaySessionCount || 0) + 1;
    }
    user.lastSessionDate = now;
  }

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

  return { room, session };
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

module.exports = {
  createRoom,
  getPublicRooms,
  getRoomById,
  joinRoom,
  leaveRoom
};
