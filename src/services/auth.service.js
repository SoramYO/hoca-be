const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, CLIENT_URL } = require('../config/env');
const { OAuth2Client } = require('google-auth-library');
const { GOOGLE_CLIENT_ID } = require('../config/env');
const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const crypto = require('crypto');
const emailService = require('./email.service');

const signToken = (id, role, isPremium) => {
  return jwt.sign({ id, role, isPremium }, JWT_SECRET, { expiresIn: '7d' });
};

const registerUser = async (userData) => {
  const { displayName, email, password } = userData;

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    throw new Error('User already exists');
  }

  // Create user
  const user = await User.create({
    displayName,
    email,
    password
  });

  const token = signToken(user._id, user.role, user.isPremium);

  return { user, token };
};

const loginUser = async ({ email, password }) => {
  // Check user
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Check password
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  const token = signToken(user._id, user.role, user.isPremium);

  // Return user without password
  const userObj = user.toObject();
  delete userObj.password;

  return { user: userObj, token };
};

const changePassword = async (userId, oldPassword, newPassword) => {
  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw new Error('User not found');
  }

  const isMatch = await user.matchPassword(oldPassword);
  if (!isMatch) {
    throw new Error('Incorrect password');
  }

  user.password = newPassword;
  await user.save(); // triggers pre('save') hash

  return true;
};

const forgotPassword = async (email) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error('Email not found');
  }

  // Generate Reset Token
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash and set to resetPasswordToken field
  user.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire (10 mins)
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  await user.save();

  // Create reset url
  // Note: Adjust CLIENT_URL in env or hardcode for now based on context
  const resetUrl = `${CLIENT_URL}/auth/reset-password/${resetToken}`;

  const message = `
    <h1>You have requested a password reset</h1>
    <p>Please go to this link to reset your password:</p>
    <a href="${resetUrl}" clicktracking=off>${resetUrl}</a>
    <p>This link expires in 10 minutes.</p>
  `;

  try {
    await emailService.sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      text: `Reset Password Link: ${resetUrl}`,
      html: message
    });

    return true;
  } catch (error) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();
    throw new Error('Email could not be sent');
  }
};

const resetPassword = async (token, newPassword) => {
  // Get hashed token
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const user = await User.findOne({
    resetPasswordToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    throw new Error('Invalid token');
  }

  // Set new password
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  await user.save();

  const newToken = signToken(user._id, user.role, user.isPremium);
  return { token: newToken, user };
};

const googleLogin = async (token) => {
  let googleId, email, name, picture;

  try {
    // Try verify as ID Token
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    googleId = payload.sub;
    email = payload.email;
    name = payload.name;
    picture = payload.picture;
  } catch (error) {
    console.log('[Google Auth] ID Token verify failed:', error.message);
    // If fails, try as Access Token
    try {
      // Create a new client instance to avoid state pollution/race conditions
      const requestClient = new OAuth2Client(GOOGLE_CLIENT_ID);
      requestClient.setCredentials({ access_token: token });

      const response = await requestClient.request({
        url: 'https://www.googleapis.com/oauth2/v3/userinfo'
      });
      const data = response.data;
      googleId = data.sub;
      email = data.email;
      name = data.name;
      picture = data.picture;

    } catch (err) {
      console.error('[Google Auth] Access Token verify failed:', err);
      throw new Error('Invalid Google Token: ' + err.message);
    }
  }

  // Check if user exists
  let user = await User.findOne({ email });

  if (user) {
    // If user exists but no googleId (registered via email/password), link it
    if (!user.googleId) {
      user.googleId = googleId;
      if (!user.avatar) user.avatar = picture;
      await user.save();
    }
  } else {
    // Create new user
    user = await User.create({
      displayName: name,
      email,
      googleId,
      avatar: picture,
      // Random password for google users
      password: crypto.randomBytes(16).toString('hex')
    });
  }

  const tokenJWT = signToken(user._id, user.role, user.isPremium);
  return { user, token: tokenJWT };
};

module.exports = {
  registerUser,
  loginUser,
  changePassword,
  forgotPassword,
  resetPassword,
  googleLogin
};
