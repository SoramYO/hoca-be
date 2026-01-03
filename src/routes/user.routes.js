const userController = require('../controllers/user.controller');
const { protect } = require('../middlewares/auth.middleware');

const userRoutes = async (fastify, options) => {
  // Protect all routes in this plugin
  fastify.addHook('onRequest', protect);

  fastify.get('/me', userController.getProfile);
  fastify.put('/me', userController.updateProfile);
  fastify.patch('/me', userController.updateProfile);
  fastify.patch('/me/virtual-background', userController.updateVirtualBackground);
  fastify.get('/me/dashboard', userController.getDashboard);
  fastify.get('/me/weekly-activity', userController.getWeeklyActivity);
  fastify.post('/study-time', userController.updateStudyTime);
  fastify.get('/leaderboard', userController.getLeaderboard);
  fastify.post('/recover-streak', userController.recoverStreak);

  // Admin Routes
  const { admin } = require('../middlewares/auth.middleware');
  fastify.get('/:id', { preHandler: [admin] }, userController.getUserById);
};

module.exports = userRoutes;
