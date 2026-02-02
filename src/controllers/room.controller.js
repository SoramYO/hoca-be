const roomService = require('../services/room.service');
const subscriptionService = require('../services/subscription.service');

const createRoom = async (req, reply) => {
  try {
    const room = await roomService.createRoom(req.user.id, req.body);
    reply.code(201).send(room);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const getRooms = async (req, reply) => {
  try {
    const { search } = req.query;
    const query = {};
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    const rooms = await roomService.getPublicRooms(query);
    reply.send(rooms);
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const getRoom = async (req, reply) => {
  try {
    const room = await roomService.getRoomById(req.params.id);
    reply.send(room);
  } catch (error) {
    reply.code(404).send({ message: error.message });
  }
};

const getMyRooms = async (req, reply) => {
  try {
    const rooms = await roomService.getUserRooms(req.user.id);
    reply.send(rooms);
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const joinRoom = async (req, reply) => {
  try {
    const { password } = req.body || {};
    const result = await roomService.joinRoom(req.params.id, req.user.id, password);
    reply.send(result);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const leaveRoom = async (req, reply) => {
  try {
    await roomService.leaveRoom(req.params.id, req.user.id);
    reply.send({ message: 'Left successfully' });
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

/**
 * Close room - only owner can close their room
 */
const closeRoom = async (req, reply) => {
  try {
    const Room = require('../models/Room');
    const room = await Room.findById(req.params.id);

    if (!room) {
      return reply.code(404).send({ message: 'Room not found' });
    }

    // Check ownership
    if (room.owner?.toString() !== req.user.id && req.user.role !== 'ADMIN') {
      return reply.code(403).send({ message: 'Only room owner can close the room' });
    }

    const result = await roomService.closeRoom(req.params.id, 'manual');

    // Notify participants via socket if available
    if (global.io) {
      global.io.to(req.params.id).emit('room-closed', {
        roomId: req.params.id,
        reason: 'manual',
        message: 'Phòng đã được đóng bởi chủ phòng.'
      });
    }

    reply.send(result);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

/**
 * Check if user can join a room (before entering lobby)
 * Uses subscription service for eligibility checks
 */
const checkJoinEligibility = async (req, reply) => {
  try {
    const User = require('../models/User');

    const user = await User.findById(req.user.id);
    if (!user) {
      return reply.code(404).send({ canJoin: false, message: 'User not found' });
    }

    // Use subscription service for eligibility check
    const eligibility = subscriptionService.checkJoinRoomEligibility(user);
    const tierLimits = subscriptionService.getTierLimits(subscriptionService.getEffectiveTier(user));

    if (!eligibility.canJoin) {
      return reply.send({
        canJoin: false,
        message: eligibility.reason,
        usedMinutes: user.todayRoomMinutes || 0,
        limitMinutes: tierLimits.dailyStudyMinutes,
        remainingMinutes: 0
      });
    }

    reply.send({
      canJoin: true,
      usedMinutes: user.todayRoomMinutes || 0,
      limitMinutes: tierLimits.dailyStudyMinutes,
      remainingMinutes: eligibility.remainingMinutes
    });
  } catch (error) {
    reply.code(500).send({ canJoin: false, message: error.message });
  }
};

/**
 * Check if user can create a room
 */
const checkCreateEligibility = async (req, reply) => {
  try {
    const User = require('../models/User');

    const user = await User.findById(req.user.id);
    if (!user) {
      return reply.code(404).send({ canCreate: false, message: 'User not found' });
    }

    const eligibility = subscriptionService.checkRoomCreationEligibility(user);
    const tierLimits = subscriptionService.getTierLimits(subscriptionService.getEffectiveTier(user));

    reply.send({
      canCreate: eligibility.canCreate,
      message: eligibility.reason,
      todayRoomCreatedCount: user.todayRoomCreatedCount || 0,
      roomsPerDay: tierLimits.roomsPerDay,
      roomDurationMinutes: tierLimits.roomDurationMinutes,
      requiresSequentialRooms: tierLimits.requireSequentialRooms,
      hasActiveRoom: !!user.activePersonalRoomId
    });
  } catch (error) {
    reply.code(500).send({ canCreate: false, message: error.message });
  }
};

/**
 * Get room categories (public for users)
 */
const getCategories = async (req, reply) => {
  try {
    const RoomCategory = require('../models/RoomCategory');
    const categories = await RoomCategory.find().sort('name');
    reply.send(categories);
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

/**
 * Check if user can use microphone in a room
 * Returns mic permission status based on room type and user tier
 */
const checkMicPermission = async (req, reply) => {
  try {
    const Room = require('../models/Room');
    const User = require('../models/User');

    const room = await Room.findById(req.params.id);
    if (!room) {
      return reply.code(404).send({
        canUseMic: false,
        message: 'Room not found'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return reply.code(404).send({
        canUseMic: false,
        message: 'User not found'
      });
    }

    const permission = subscriptionService.checkMicPermission(user, room);

    reply.send({
      canUseMic: permission.canUseMic,
      reason: permission.reason,
      showUpgrade: permission.showUpgrade || false,
      hideMicIcon: permission.hideMicIcon || false,
      roomType: room.roomType,
      userTier: subscriptionService.getEffectiveTier(user)
    });
  } catch (error) {
    reply.code(500).send({ canUseMic: false, message: error.message });
  }
};

/**
 * Get available room types for creation based on user tier
 */
const getAvailableRoomTypes = async (req, reply) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.id);

    if (!user) {
      return reply.code(404).send({ message: 'User not found' });
    }

    const tier = subscriptionService.getEffectiveTier(user);
    const isAdmin = user.role === 'ADMIN';

    // FREE users can only create SILENT rooms
    // HOCA+ and ADMIN can create both
    const availableTypes = [];

    availableTypes.push({
      type: 'SILENT',
      name: 'Phòng Im lặng',
      description: 'Không ai được dùng mic. Tập trung học tập tuyệt đối.',
      icon: '🔇',
      available: true
    });

    if (tier !== 'FREE' || isAdmin) {
      availableTypes.push({
        type: 'DISCUSSION',
        name: 'Phòng Thảo luận',
        description: 'HOCA+ có thể dùng mic để thảo luận.',
        icon: '🎤',
        available: true
      });
    } else {
      availableTypes.push({
        type: 'DISCUSSION',
        name: 'Phòng Thảo luận',
        description: 'Nâng cấp HOCA+ để tạo phòng có mic!',
        icon: '🔒',
        available: false,
        requiresUpgrade: true
      });
    }

    reply.send({
      tier,
      isAdmin,
      roomTypes: availableTypes
    });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

module.exports = {
  createRoom,
  getRooms,
  getRoom,
  joinRoom,
  leaveRoom,
  closeRoom,
  checkJoinEligibility,
  checkCreateEligibility,
  checkMicPermission,
  getAvailableRoomTypes,
  getCategories,
  getMyRooms
};
