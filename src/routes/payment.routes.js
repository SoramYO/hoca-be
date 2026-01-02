const paymentController = require('../controllers/payment.controller');
const { protect } = require('../middlewares/auth.middleware');

const paymentRoutes = async (fastify, options) => {
  fastify.post('/create_payment_url', { preHandler: protect }, paymentController.createPayment);
  // Endpoint to verify payment after PayOS redirect
  fastify.post('/verify', { preHandler: protect }, paymentController.verifyPayment);
};

module.exports = paymentRoutes;
