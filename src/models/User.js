const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, sparse: true }, // Sparse allows null/unique
  phone: { type: String, unique: true, sparse: true },
  googleId: { type: String, unique: true, sparse: true },
  password: { type: String, select: false },

  displayName: { type: String, required: true },
  avatar: { type: String, default: '' },
  bio: { type: String, default: '' },

  role: {
    type: String,
    enum: ['MEMBER', 'ADMIN'],
    default: 'MEMBER'
  },

  // Subscription Tier System
  subscriptionTier: {
    type: String,
    enum: ['FREE', 'MONTHLY', 'YEARLY', 'LIFETIME'],
    default: 'FREE'
  },
  subscriptionExpiry: { type: Date },
  subscriptionStartDate: { type: Date },

  // Session tracking for FREE tier (60min limit, 2 sessions/day)
  todaySessionCount: { type: Number, default: 0 },
  lastSessionDate: { type: Date },
  currentSessionStartTime: { type: Date }, // For tracking 60-min limit

  // Study Stats
  dailyStudyGoal: { type: Number, default: 120 }, // minutes
  todayStudyMinutes: { type: Number, default: 0 },
  totalStudyMinutes: { type: Number, default: 0 },
  currentStreak: { type: Number, default: 0 },
  previousStreak: { type: Number, default: 0 }, // Streak value before it was broken
  longestStreak: { type: Number, default: 0 },
  lastStudyDate: { type: Date },
  xp: { type: Number, default: 0 },
  lessonsCompleted: { type: Number, default: 0 },

  // Streak Recovery
  lastStreakRecoveryDate: { type: Date }, // For limiting recovery to 1x per week
  yesterdayStudyMinutes: { type: Number, default: 0 }, // Track yesterday's minutes for recovery check
  streakRecoveryUsedToday: { type: Boolean, default: false }, // If recovery was used today

  // Status
  isBlocked: { type: Boolean, default: false }, // Legacy block
  isLocked: { type: Boolean, default: false }, // Admin lock
  lockReason: { type: String, default: '' },
  notificationEnabled: { type: Boolean, default: true },
  isOnboarded: { type: Boolean, default: false },

  // Arrays
  badges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Badge' }],

  // Room Tracking
  currentRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
  ownedRoomCount: { type: Number, default: 0 }, // Track total rooms owned
  todayRoomMinutes: { type: Number, default: 0 }, // For Free user 3h/day limit
  lastRoomDate: { type: Date }, // To reset todayRoomMinutes daily

  // Daily room creation tracking (resets daily)
  todayRoomCreatedCount: { type: Number, default: 0 },
  lastRoomCreatedDate: { type: Date },

  // Track active personal room for FREE tier (must close before creating new)
  activePersonalRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },

  warnings: [{
    reason: String,
    expiresAt: Date,
    createdAt: { type: Date, default: Date.now }
  }],

  // Auth Recovery
  resetPasswordToken: { type: String, select: false },
  resetPasswordExpire: { type: Date, select: false }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual: isPremium for backward compatibility
userSchema.virtual('isPremium').get(function () {
  if (this.subscriptionTier === 'FREE') return false;
  if (this.subscriptionTier === 'LIFETIME') return true;
  // For MONTHLY/YEARLY, check if subscription is still valid
  if (this.subscriptionExpiry && new Date(this.subscriptionExpiry) < new Date()) {
    return false;
  }
  return true;
});

// Hash password before saving
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (err) {
    throw err;
  }
});

// Method to check password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
