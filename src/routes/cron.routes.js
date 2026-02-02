const cronController = require('../controllers/cron.controller');

const cronRoutes = async (fastify, options) => {
  // Manual triggers for external cron services (e.g., cron-job.org)
  // Protected by CRON_SECRET in controller
  fastify.get('/cleanup', cronController.runCleanup);
  fastify.get('/streak-maintenance', cronController.runStreakMaintenance);
  fastify.get('/room-maintenance', cronController.runRoomMaintenance);
};

module.exports = cronRoutes;
