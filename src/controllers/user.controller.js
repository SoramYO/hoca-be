const userService = require('../services/user.service');

const getProfile = async (req, reply) => {
  try {
    const user = await userService.getUserProfile(req.user.id);
    reply.send(user);
  } catch (error) {
    reply.code(404).send({ message: error.message });
  }
};

const updateProfile = async (req, reply) => {
  try {
    const user = await userService.updateUserProfile(req.user.id, req.body);
    reply.send(user);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const getDashboard = async (req, reply) => {
  try {
    const dashboard = await userService.getUserDashboard(req.user.id);
    reply.send(dashboard);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const getUserById = async (req, reply) => {
  try {
    const user = await userService.getUserById(req.params.id);
    reply.send(user);
  } catch (error) {
    reply.code(404).send({ message: error.message });
  }
};

const updateStudyTime = async (req, reply) => {
  try {
    const { minutes } = req.body;
    if (!minutes || minutes <= 0) {
      return reply.code(400).send({ message: 'Invalid minutes' });
    }
    const user = await userService.trackStudyTime(req.user.id, minutes);
    reply.send({
      message: 'Study time updated',
      todayStudyMinutes: user.todayStudyMinutes,
      totalStudyMinutes: user.totalStudyMinutes,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak
    });
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const getLeaderboard = async (req, reply) => {
  try {
    const data = await userService.getLeaderboard();
    reply.send(data);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const recoverStreak = async (req, reply) => {
  try {
    // Check if user is premium - they don't need ads but let's allow recovery anyway
    const result = await userService.recoverStreak(req.user.id);
    reply.send(result);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const updateVirtualBackground = async (req, reply) => {
  try {
    const user = await userService.updateVirtualBackground(req.user.id, req.body);
    reply.send({ message: 'Virtual background updated', virtualBackground: user.virtualBackground });
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const getWeeklyActivity = async (req, reply) => {
  try {
    const activity = await userService.getWeeklyActivity(req.user.id);
    reply.send(activity);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  getDashboard,
  getUserById,
  updateStudyTime,
  getLeaderboard,
  recoverStreak,
  updateVirtualBackground,
  getWeeklyActivity
};
