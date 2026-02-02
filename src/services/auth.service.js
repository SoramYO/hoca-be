const User = require('../models/User');
const Notification = require('../models/Notification');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, CLIENT_URL } = require('../config/env');
const { OAuth2Client } = require('google-auth-library');
const { GOOGLE_CLIENT_ID } = require('../config/env');
const client = new OAuth2Client(GOOGLE_CLIENT_ID);
const crypto = require('crypto');
const emailService = require('./email.service');

// Helper to create admin notification for blocked login attempts
const notifyAdminBlockedLogin = async (user) => {
  try {
    // Find all admin users
    const admins = await User.find({ role: 'ADMIN' });

    // Create notification for each admin
    const notifications = admins.map(admin => ({
      user: admin._id,
      type: 'BLOCKED_LOGIN_ATTEMPT',
      title: 'Blocked User Login Attempt',
      message: `Người dùng bị khóa "${user.displayName}" (${user.email}) đã cố gắng đăng nhập.`,
      icon: 'block',
      data: {
        userId: user._id,
        userEmail: user.email,
        userName: user.displayName,
        lockReason: user.lockReason || 'Vi phạm quy định cộng đồng',
        attemptTime: new Date()
      },
      isAdminNotification: true
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  } catch (err) {
    console.error('Failed to notify admins of blocked login attempt:', err);
  }
};

const signToken = (id, role, subscriptionTier) => {
  return jwt.sign({ id, role, subscriptionTier }, JWT_SECRET, { expiresIn: '7d' });
};

const registerUser = async (userData) => {
  const { displayName, email, password } = userData;

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    throw new Error('User already exists');
  }

  // Generate 6-digit OTP
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const verificationCodeExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Create user with INACTIVE status
  const user = await User.create({
    displayName,
    email,
    password,
    accountStatus: 'INACTIVE',
    verificationCode,
    verificationCodeExpires
  });

  // Send verification OTP email (non-blocking)
  try {
    const axios = require('axios');
    const { EMAIL_SERVICE_URL, EMAIL_SERVICE_API_KEY, CLIENT_URL } = require('../config/env');

    // Verification link
    const verifyLink = `${CLIENT_URL}/auth/verify?email=${encodeURIComponent(email)}&code=${verificationCode}`;

    const verifyEmailUrl = EMAIL_SERVICE_URL.replace('send-reset-email', 'send-verify-email');

    axios.post(
      verifyEmailUrl,
      {
        email: user.email,
        displayName: user.displayName,
        verificationCode,
        verifyLink,
        apiKey: EMAIL_SERVICE_API_KEY
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    ).catch(error => {
      console.error('Failed to send verification email:', error.message);
    });
  } catch (error) {
    console.error('Verification email error:', error.message);
  }

  // Return user info but NO token (must verify first)
  return {
    user: {
      id: user._id,
      email: user.email,
      displayName: user.displayName,
      accountStatus: user.accountStatus
    },
    message: 'Please check your email for verification code. Code expires in 5 minutes.'
  };
};

const loginUser = async ({ email, password }) => {
  // Check user
  // Also select verificationCode to check for legacy users
  const user = await User.findOne({ email }).select('+password +verificationCode');
  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Check if account is verified
  if (user.accountStatus === 'INACTIVE') {
    // HOTFIX: Check if this is a legacy user (created before verification feature)
    // Legacy users default to INACTIVE but have no verificationCode
    if (!user.verificationCode) {
      // Auto-activate legacy user
      user.accountStatus = 'ACTIVE';
      await user.save({ validateBeforeSave: false });
    } else {
      throw new Error('Please verify your email before logging in. Check your inbox for the verification code.');
    }
  }

  if (user.isLocked || user.isBlocked) {
    // Notify admins about blocked user login attempt
    await notifyAdminBlockedLogin(user);
    throw new Error('User is locked');
  }

  // Check password
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    throw new Error('Invalid credentials');
  }

  const token = signToken(user._id, user.role, user.subscriptionTier);

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

  // Set expire (1 hour)
  user.resetPasswordExpire = Date.now() + 60 * 60 * 1000;

  await user.save({ validateBeforeSave: false });

  // Create reset url
  const baseUrl = CLIENT_URL.endsWith('/') ? CLIENT_URL.slice(0, -1) : CLIENT_URL;
  const resetUrl = `${baseUrl}/auth/reset-password/${resetToken}`;

  try {
    // Call email microservice (deployed on Vercel)
    const axios = require('axios');
    const { EMAIL_SERVICE_URL, EMAIL_SERVICE_API_KEY } = require('../config/env');

    const response = await axios.post(
      EMAIL_SERVICE_URL,
      {
        email: user.email,
        resetLink: resetUrl,
        apiKey: EMAIL_SERVICE_API_KEY
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000 // 10 seconds timeout
      }
    );

    if (!response.data.success) {
      throw new Error('Email service returned error');
    }

    return true;
  } catch (error) {
    console.error('Email microservice error:', error.message);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();
    throw new Error('Email could not be sent: ' + error.message);
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

  const newToken = signToken(user._id, user.role, user.subscriptionTier);
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
    const isNewUser = true;
    user = await User.create({
      displayName: name,
      email,
      googleId,
      avatar: picture,
      // Random password for google users
      password: crypto.randomBytes(16).toString('hex')
    });

    // Send welcome email for new Google users (non-blocking)
    if (isNewUser) {
      try {
        const axios = require('axios');
        const { EMAIL_SERVICE_URL, EMAIL_SERVICE_API_KEY } = require('../config/env');

        const welcomeUrl = EMAIL_SERVICE_URL.replace('send-reset-email', 'send-welcome-email');

        axios.post(
          welcomeUrl,
          {
            email: user.email,
            displayName: user.displayName,
            apiKey: EMAIL_SERVICE_API_KEY
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          }
        ).catch(error => {
          console.error('Failed to send welcome email (Google):', error.message);
        });
      } catch (error) {
        console.error('Welcome email error (Google):', error.message);
      }
    }
  }

  if (user.isLocked || user.isBlocked) {
    // Notify admins about blocked user login attempt
    await notifyAdminBlockedLogin(user);
    throw new Error('User is locked');
  }

  const tokenJWT = signToken(user._id, user.role, user.subscriptionTier);
  return { user, token: tokenJWT };
};

/**
 * Verify OTP code and activate account
 */
const verifyOtp = async (email, code) => {
  const user = await User.findOne({ email }).select('+verificationCode +verificationCodeExpires');

  if (!user) {
    throw new Error('User not found');
  }

  if (user.accountStatus === 'ACTIVE') {
    throw new Error('Account is already verified');
  }

  // Check if code matches and not expired
  if (user.verificationCode !== code) {
    throw new Error('Invalid verification code');
  }

  if (new Date() > user.verificationCodeExpires) {
    throw new Error('Verification code has expired. Please request a new one.');
  }

  // Activate account
  user.accountStatus = 'ACTIVE';
  user.verificationCode = undefined;
  user.verificationCodeExpires = undefined;
  await user.save();

  // Generate token for auto-login
  const token = signToken(user._id, user.role, user.subscriptionTier);

  // Send welcome email after successful verification
  try {
    const axios = require('axios');
    const { EMAIL_SERVICE_URL, EMAIL_SERVICE_API_KEY } = require('../config/env');

    const welcomeUrl = EMAIL_SERVICE_URL.replace('send-reset-email', 'send-welcome-email');

    axios.post(
      welcomeUrl,
      {
        email: user.email,
        displayName: user.displayName,
        apiKey: EMAIL_SERVICE_API_KEY
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    ).catch(error => {
      console.error('Failed to send welcome email:', error.message);
    });
  } catch (error) {
    console.error('Welcome email error:', error.message);
  }

  return { user, token };
};

/**
 * Resend verification OTP
 */
const resendOtp = async (email) => {
  const user = await User.findOne({ email });

  if (!user) {
    throw new Error('User not found');
  }

  if (user.accountStatus === 'ACTIVE') {
    throw new Error('Account is already verified');
  }

  // Generate new 6-digit OTP
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  const verificationCodeExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  user.verificationCode = verificationCode;
  user.verificationCodeExpires = verificationCodeExpires;
  await user.save();

  // Send verification email
  try {
    const axios = require('axios');
    const { EMAIL_SERVICE_URL, EMAIL_SERVICE_API_KEY, CLIENT_URL } = require('../config/env');

    const verifyLink = `${CLIENT_URL}/auth/verify?email=${encodeURIComponent(email)}&code=${verificationCode}`;
    const verifyEmailUrl = EMAIL_SERVICE_URL.replace('send-reset-email', 'send-verify-email');

    await axios.post(
      verifyEmailUrl,
      {
        email: user.email,
        displayName: user.displayName,
        verificationCode,
        verifyLink,
        apiKey: EMAIL_SERVICE_API_KEY
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );

    return { message: 'Verification code sent. Check your email.' };
  } catch (error) {
    console.error('Resend verification email error:', error.message);
    throw new Error('Failed to send verification email. Please try again.');
  }
};

module.exports = {
  registerUser,
  loginUser,
  changePassword,
  forgotPassword,
  resetPassword,
  googleLogin,
  verifyOtp,
  resendOtp
};
