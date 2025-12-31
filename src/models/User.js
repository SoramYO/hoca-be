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

  // Premium Status
  isPremium: { type: Boolean, default: false },
  premiumExpiry: { type: Date },

  // Virtual Background (Premium Feature)
  virtualBackground: {
    enabled: { type: Boolean, default: false },
    mode: {
      type: String,
      enum: ['none', 'blur', 'image', 'video'],
      default: 'none'
    },
    imageUrl: { type: String }, // For static image backgrounds
    blurAmount: { type: Number, default: 10, min: 0, max: 20 } // Blur intensity
  },

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
  isBlocked: { type: Boolean, default: false },
  notificationEnabled: { type: Boolean, default: true },
  isOnboarded: { type: Boolean, default: false },

  // Arrays
  badges: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Badge' }],

  // Room Tracking
  currentRoomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
  todayRoomMinutes: { type: Number, default: 0 }, // For Free user 3h/day limit
  lastRoomDate: { type: Date }, // To reset todayRoomMinutes daily

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
