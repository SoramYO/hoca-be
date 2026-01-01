const roomService = require('../services/room.service');

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
    const rooms = await roomService.getPublicRooms();
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

// Check if user can join a room (before entering lobby)
const checkJoinEligibility = async (req, reply) => {
  try {
    const User = require('../models/User');
    const SystemConfig = require('../models/SystemConfig');

    const user = await User.findById(req.user.id);
    if (!user) {
      return reply.code(404).send({ canJoin: false, message: 'User not found' });
    }

    // Premium users can always join
    if (user.isPremium) {
      return reply.send({ canJoin: true, remainingMinutes: Infinity });
    }

    // Check daily limit for free users
    const freeDailyLimit = await SystemConfig.getValue('freeDailyStudyMinutes', 180);
    const now = new Date();

    // Reset daily minutes if new day
    if (user.lastRoomDate) {
      const lastDate = new Date(user.lastRoomDate);
      const isNewDay = now.getDate() !== lastDate.getDate() ||
        now.getMonth() !== lastDate.getMonth() ||
        now.getFullYear() !== lastDate.getFullYear();
      if (isNewDay) {
        user.todayRoomMinutes = 0;
        user.lastRoomDate = now;
        await user.save();
      }
    }

    const usedMinutes = user.todayRoomMinutes || 0;
    const remainingMinutes = Math.max(0, freeDailyLimit - usedMinutes);

    if (usedMinutes >= freeDailyLimit) {
      return reply.send({
        canJoin: false,
        message: `Bạn đã đạt giới hạn ${freeDailyLimit / 60} giờ học miễn phí hôm nay. Nâng cấp Pro để học không giới hạn!`,
        usedMinutes,
        limitMinutes: freeDailyLimit,
        remainingMinutes: 0
      });
    }

    reply.send({
      canJoin: true,
      usedMinutes,
      limitMinutes: freeDailyLimit,
      remainingMinutes
    });
  } catch (error) {
    reply.code(500).send({ canJoin: false, message: error.message });
  }
};

module.exports = {
  createRoom,
  getRooms,
  getRoom,
  joinRoom,
  leaveRoom,
  checkJoinEligibility
};
