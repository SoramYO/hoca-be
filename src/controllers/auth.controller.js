const authService = require('../services/auth.service');

const register = async (req, reply) => {
  try {
    const { displayName, email, password } = req.body;

    // Basic validation
    if (!displayName || !email || !password) {
      return reply.code(400).send({ message: 'Missing required fields' });
    }

    const result = await authService.registerUser({ displayName, email, password });

    reply.code(201).send({
      message: result.message,
      user: result.user,
      requiresVerification: true
    });
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const verifyOtp = async (req, reply) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return reply.code(400).send({ message: 'Email and verification code are required' });
    }

    const { user, token } = await authService.verifyOtp(email, code);

    reply.send({
      message: 'Email verified successfully. Welcome to HOCA!',
      user,
      token
    });
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const resendOtp = async (req, reply) => {
  try {
    const { email } = req.body;

    if (!email) {
      return reply.code(400).send({ message: 'Email is required' });
    }

    const result = await authService.resendOtp(email);

    reply.send(result);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const login = async (req, reply) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return reply.code(400).send({ message: 'Missing email or password' });
    }

    const { user, token } = await authService.loginUser({ email, password });

    reply.send({
      message: 'Login successful',
      user: user,
      token
    });
  } catch (error) {
    reply.code(401).send({ message: error.message });
  }
};

const changePassword = async (req, reply) => {
  try {
    const { oldPassword, newPassword } = req.body;
    // req.user is populated by authenticate middleware (to be added in route)
    if (!req.user || !req.user.id) {
      return reply.code(401).send({ message: 'Unauthorized' });
    }

    await authService.changePassword(req.user.id, oldPassword, newPassword);

    reply.send({ message: 'Password updated successfully' });
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const forgotPassword = async (req, reply) => {
  try {
    const { email } = req.body;
    if (!email) {
      return reply.code(400).send({ message: 'Email is required' });
    }

    await authService.forgotPassword(email);

    reply.send({ message: 'Email sent' });
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const resetPassword = async (req, reply) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
      return reply.code(400).send({ message: 'New password is required' });
    }

    const { user, token: newToken } = await authService.resetPassword(token, password);

    reply.send({
      message: 'Password reset successful',
      token: newToken,
      user
    });
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const googleLogin = async (req, reply) => {
  try {
    const { token: idToken } = req.body;
    if (!idToken) {
      return reply.code(400).send({ message: 'Google Token is required' });
    }

    const { user, token } = await authService.googleLogin(idToken);

    reply.send({
      message: 'Google login successful',
      user,
      token
    });
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

module.exports = {
  register,
  login,
  changePassword,
  forgotPassword,
  resetPassword,
  googleLogin,
  verifyOtp,
  resendOtp
};
