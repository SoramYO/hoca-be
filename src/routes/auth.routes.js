const authController = require('../controllers/auth.controller');

const { protect } = require('../middlewares/auth.middleware');

const authRoutes = async (fastify, options) => {
  fastify.post('/register', authController.register);
  fastify.post('/login', authController.login);

  // Email Verification (OTP Anti-Spam)
  fastify.post('/verify-otp', authController.verifyOtp);
  fastify.post('/resend-otp', authController.resendOtp);

  // Protected Routes
  fastify.post('/change-password', { preHandler: protect }, authController.changePassword);

  // Public Routes
  fastify.post('/forgot-password', authController.forgotPassword);
  fastify.post('/reset-password/:token', authController.resetPassword);
  fastify.post('/google', authController.googleLogin);
};

module.exports = authRoutes;

