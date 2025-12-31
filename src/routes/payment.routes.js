const paymentController = require('../controllers/payment.controller');
const { protect } = require('../middlewares/auth.middleware');

const paymentRoutes = async (fastify, options) => {
  fastify.post('/create_payment_url', { preHandler: protect }, paymentController.createPayment);
  fastify.get('/vnpay_return', paymentController.vnpayReturn);
};

module.exports = paymentRoutes;
