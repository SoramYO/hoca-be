const feedbackController = require('../controllers/feedback.controller');
const { protect } = require('../middlewares/auth.middleware');

const feedbackRoutes = async (fastify, options) => {
  // All feedback routes require authenticated user
  fastify.addHook('onRequest', protect);

  // User submit feedback
  fastify.post('/', feedbackController.createFeedback);
};

module.exports = feedbackRoutes;

