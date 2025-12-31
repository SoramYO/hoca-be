const reportController = require('../controllers/report.controller');
const { protect, admin } = require('../middlewares/auth.middleware');

const reportRoutes = async (fastify, options) => {
  // User can report
  fastify.post('/', { preHandler: protect }, reportController.submitReport);

  // Admin manages reports
  fastify.register(async (adminRoutes) => {
    adminRoutes.addHook('onRequest', protect);
    adminRoutes.addHook('onRequest', admin);

    adminRoutes.get('/', reportController.getAllReports);
    adminRoutes.put('/:id', reportController.updateReport);
  });
};

module.exports = reportRoutes;
