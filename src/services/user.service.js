const User = require('../models/User');
const Badge = require('../models/Badge');

const createUser = async (userData) => {
  const user = new User(userData);
  await user.save();
  return user;
};

const authenticateUser = async (email, password) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error('User not found');
  }
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new Error('Invalid password');
  }
  return user;
};

const getUserProfile = async (userId) => {
  const user = await User.findById(userId).populate('badges');
  if (!user) {
    throw new Error('User not found');
  }
  return user;
};

const updateUserProfile = async (userId, updateData) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Allow updates to specific fields
  if (updateData.displayName) user.displayName = updateData.displayName;
  if (updateData.bio) user.bio = updateData.bio;
  if (updateData.avatar) user.avatar = updateData.avatar;
  if (updateData.dailyStudyGoal) user.dailyStudyGoal = updateData.dailyStudyGoal;
  if (typeof updateData.isOnboarded !== 'undefined') user.isOnboarded = updateData.isOnboarded;

  await user.save();
  return user;
};

const getUserDashboard = async (userId) => {
  const user = await User.findById(userId).populate('badges');

  // Check if we need to reset daily stats based on lastStudyDate
  const now = new Date();
  const lastStudy = user.lastStudyDate ? new Date(user.lastStudyDate) : null;

  let todayMinutes = user.todayStudyMinutes;

  if (lastStudy) {
    const isSameDay = now.getDate() === lastStudy.getDate() &&
      now.getMonth() === lastStudy.getMonth() &&
      now.getFullYear() === lastStudy.getFullYear();
    if (!isSameDay) {
      todayMinutes = 0;
    }
  }

  // Calculate Streak Recovery Eligibility
  let canRecoverStreak = false;

  if (user.dailyStudyGoal > 0 && !user.streakRecoveryUsedToday) {
    // Check Cooldown
    let cooldownOk = true;
    if (user.lastStreakRecoveryDate) {
      const diffTime = Math.abs(now - new Date(user.lastStreakRecoveryDate));
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      // Accurate 7 days check
      if ((now.getTime() - new Date(user.lastStreakRecoveryDate).getTime()) < 7 * 24 * 60 * 60 * 1000) {
        cooldownOk = false;
      }
    }

    if (cooldownOk && lastStudy) {
      // Check Date Gap
      // Reset time part for accurate day diff
      const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const d2 = new Date(lastStudy.getFullYear(), lastStudy.getMonth(), lastStudy.getDate());
      const diffTime = Math.abs(d1 - d2);
      const dayDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const dailyGoal = user.dailyStudyGoal || 60;

      if (dayDiff === 0) {
        // Studied today - check if yesterday was missed (tracked in yesterdayStudyMinutes)
        const missedYesterday = user.yesterdayStudyMinutes < dailyGoal;
        if (missedYesterday) {
          // Only allow recovery if we had a streak to lose (streak broken today)
          if (user.currentStreak === 0 && user.previousStreak > 0) canRecoverStreak = true;
        }
      } else if (dayDiff === 1) {
        // Last study yesterday. Missed goal?
        // Note: todayStudyMinutes holds yesterday's minutes in this context as new day logic hasn't run
        const missedYesterday = user.todayStudyMinutes < dailyGoal;
        // Logic: if currentStreak > 0, we have a streak to save.
        if (missedYesterday && user.currentStreak > 0) canRecoverStreak = true;
      } else if (dayDiff === 2) {
        // Last study day before yesterday. Missed yesterday completely.
        // Logic: if currentStreak > 0, we have a streak to save.
        if (user.currentStreak > 0) canRecoverStreak = true;
      }
      // dayDiff > 2 -> Missed too many days
    }
  }

  return {
    stats: {
      totalMinutes: user.totalStudyMinutes,
      todayMinutes: todayMinutes,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      dailyGoal: user.dailyStudyGoal,
      canRecoverStreak: canRecoverStreak
    },
    badges: user.badges,
    nextMilestone: '10 hours'
  };
};

const trackStudyTime = async (userId, minutes) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const now = new Date();
  const lastStudy = user.lastStudyDate ? new Date(user.lastStudyDate) : null;

  let isSameDay = false;
  if (lastStudy) {
    isSameDay = now.getDate() === lastStudy.getDate() &&
      now.getMonth() === lastStudy.getMonth() &&
      now.getFullYear() === lastStudy.getFullYear();
  }

  // New day - save yesterday's minutes and reset
  if (!isSameDay) {
    let isConsecutiveChange = false;
    let isGapOfOneDay = false;

    if (lastStudy) {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday = yesterday.getDate() === lastStudy.getDate() &&
        yesterday.getMonth() === lastStudy.getMonth() &&
        yesterday.getFullYear() === lastStudy.getFullYear();

      isConsecutiveChange = isYesterday;

      if (!isYesterday) {
        const dayBefore = new Date(now);
        dayBefore.setDate(dayBefore.getDate() - 2);
        const isDayBefore = dayBefore.getDate() === lastStudy.getDate() &&
          dayBefore.getMonth() === lastStudy.getMonth() &&
          dayBefore.getFullYear() === lastStudy.getFullYear();
        isGapOfOneDay = isDayBefore;
      }
    }

    if (isConsecutiveChange) {
      user.yesterdayStudyMinutes = user.todayStudyMinutes || 0;
    } else {
      user.yesterdayStudyMinutes = 0;
    }

    user.todayStudyMinutes = 0;
    const wasRecoveryUsed = user.streakRecoveryUsedToday;
    user.streakRecoveryUsedToday = false;

    // Check Streak Logic
    const dailyGoal = user.dailyStudyGoal || 60;
    const yesterdayMetGoal = user.yesterdayStudyMinutes >= dailyGoal;

    if (isConsecutiveChange) {
      // Day 11 -> Day 12
      if (!yesterdayMetGoal && !wasRecoveryUsed) {
        if (user.currentStreak > 0) user.previousStreak = user.currentStreak;
        user.currentStreak = 0;
      }
    } else if (isGapOfOneDay) {
      // Gap = 1 skipped day (Day 10 -> Day 12)
      if (!wasRecoveryUsed) {
        if (user.currentStreak > 0) user.previousStreak = user.currentStreak;
        user.currentStreak = 0;
      }
    } else {
      // Gap > 1 day
      if (user.currentStreak > 0) user.previousStreak = user.currentStreak;
      user.currentStreak = 0;
    }
  }

  const previousTodayMinutes = user.todayStudyMinutes;
  user.totalStudyMinutes += minutes;
  user.todayStudyMinutes += minutes;
  user.lastStudyDate = now;

  // Check Streak Condition (>= dailyGoal mins today) & Increment ONCE
  const dailyGoal = user.dailyStudyGoal || 60;
  if (previousTodayMinutes < dailyGoal && user.todayStudyMinutes >= dailyGoal) {
    user.currentStreak += 1;
    if (user.currentStreak > user.longestStreak) {
      user.longestStreak = user.currentStreak;
    }

    // Check Streak Badges
    const streakMilestones = [10, 30, 100, 200, 500, 1000];
    for (const mile of streakMilestones) {
      if (user.currentStreak === mile) {
        await awardBadge(user, `Streak ${mile}`, 'STREAK', mile);
      }
    }
  }

  // Check Total Study Time Badges (e.g. 100 hours)
  const hours = Math.floor(user.totalStudyMinutes / 60);
  const hourMilestones = [10, 50, 100, 500, 1000];
  for (const h of hourMilestones) {
    if (hours === h && (user.totalStudyMinutes - minutes) / 60 < h) {
      await awardBadge(user, `${h} Hours Master`, 'STUDY_HOURS', h);
    }
  }

  await user.save();
  return user;
};

const awardBadge = async (user, name, type, threshold) => {
  // Find or create badge definition
  let badge = await Badge.findOne({ name });
  if (!badge) {
    // Create standard badge if not exists
    badge = await Badge.create({
      name,
      type,
      threshold,
      description: `Awarded for reaching ${threshold} ${type === 'STREAK' ? 'days streak' : 'hours of study'}`
    });
  }

  // Add to user if not already owned
  if (!user.badges.includes(badge._id)) {
    user.badges.push(badge._id);
  }
};

const getLeaderboard = async () => {
  // Top 10 by XP or Total Minutes? Req says "User with most study time" and "Highest streak"
  const topStudy = await User.find({ role: 'MEMBER' })
    .sort({ totalStudyMinutes: -1 })
    .limit(10)
    .select('displayName avatar totalStudyMinutes xp');

  const topStreak = await User.find({ role: 'MEMBER' })
    .sort({ currentStreak: -1 })
    .limit(10)
    .select('displayName avatar currentStreak xp');

  return { topStudy, topStreak };
};

const getUserById = async (userId) => {
  const user = await User.findById(userId).select('-password');
  if (!user) {
    throw new Error('User not found');
  }
  // Mock stats for now as we don't have full aggregation yet
  const stats = {
    totalDuration: 2720, // minutes (approx 45h 20m)
    totalSessions: 142,
    currentStreak: user.streak || 0, // Use real streak if available
    avgScore: 88
  };
  return { ...user.toObject(), stats };
};

const recoverStreak = async (userId) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  const now = new Date();
  const lastStudy = user.lastStudyDate ? new Date(user.lastStudyDate) : null;
  const dailyGoal = user.dailyStudyGoal || 60;

  // Check if user has used recovery this week
  if (user.lastStreakRecoveryDate) {
    const daysSinceRecovery = (Date.now() - new Date(user.lastStreakRecoveryDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceRecovery < 7) {
      const daysLeft = Math.ceil(7 - daysSinceRecovery);
      throw new Error(`Bạn đã sử dụng khôi phục streak trong tuần này. Vui lòng chờ ${daysLeft} ngày nữa.`);
    }
  }

  // Check if yesterday was consecutive and missed goal
  if (!lastStudy) {
    throw new Error('Không có dữ liệu học tập để khôi phục.');
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = yesterday.getDate() === lastStudy.getDate() &&
    yesterday.getMonth() === lastStudy.getMonth() &&
    yesterday.getFullYear() === lastStudy.getFullYear();

  let isTargetDayValid = isYesterday;
  if (!isYesterday) {
    // Check if it was day before yesterday (meaning yesterday was missed COMPLELTY)
    const dayBefore = new Date(now);
    dayBefore.setDate(dayBefore.getDate() - 2);
    const isDayBefore = dayBefore.getDate() === lastStudy.getDate() &&
      dayBefore.getMonth() === lastStudy.getMonth() &&
      dayBefore.getFullYear() === lastStudy.getFullYear();

    if (isDayBefore) isTargetDayValid = true;
  }

  if (!isTargetDayValid) {
    throw new Error('Chỉ có thể khôi phục trong ngày liền sau ngày bỏ lỡ.');
  }

  // Check if yesterday actually missed the goal (if we tracked it)
  // If we missed yesterday completely (isDayBefore), we know minutes were 0.
  // If we studied yesterday but missed goal (isYesterday), we check minutes.
  const yesterdayMinutes = user.yesterdayStudyMinutes || 0;
  // Note: if gap was 2 days, yesterdayMinutes might not be accurate yet if trackStudyTime hasn't run today.
  // BUT we just established lastStudy was DayBefore. So trackStudyTime logic implies "new day".
  // User hasn't run trackStudyTime today yet? 
  // If user runs recoverStreak, it runs BEFORE trackStudyTime likely.
  // So user.yesterdayStudyMinutes is from 2 days ago (Day 10). It is Day 10's minutes.
  // It is NOT Day 11's minutes (which were 0).

  // So if isDayBefore == true, we know yesterday minutes were 0. We CAN recover (0 < goal).
  // If isYesterday == true, we use yesterdayMinutes.

  if (isYesterday && yesterdayMinutes >= dailyGoal) {
    throw new Error('Hôm qua bạn đã đạt mục tiêu, không cần khôi phục.');
  }

  // Check if already recovered today
  if (user.streakRecoveryUsedToday) {
    throw new Error('Bạn đã sử dụng khôi phục streak hôm nay rồi.');
  }

  // Perform recovery - mark as recovered, streak will be preserved/restored
  user.streakRecoveryUsedToday = true;
  user.lastStreakRecoveryDate = new Date();

  // If streak was already broken (0), restore it from previousStreak
  if (user.currentStreak === 0 && user.previousStreak > 0) {
    user.currentStreak = user.previousStreak;
  }
  // If streak wasn't broken yet (e.g. gap=1 but trackStudyTime hasn't run), we keep currentStreak.
  // And streakRecoveryUsedToday=true ensures trackStudyTime won't break it.

  await user.save();

  return {
    message: 'Đã khôi phục thành công! Hãy hoàn thành mục tiêu hôm nay để tiếp tục chuỗi.',
    currentStreak: user.currentStreak,
    nextRecoveryAvailable: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  };
};

const updateVirtualBackground = async (userId, backgroundData) => {
  const user = await User.findById(userId);
  if (!user) throw new Error('User not found');

  // Check if user is premium (required for virtual background)
  if (!user.isPremium || (user.premiumExpiry && new Date(user.premiumExpiry) < new Date())) {
    throw new Error('Virtual background is a premium feature. Please upgrade to HOCA+ to unlock this feature.');
  }

  // Validate mode
  const validModes = ['none', 'blur', 'image', 'video'];
  if (backgroundData.mode && !validModes.includes(backgroundData.mode)) {
    throw new Error('Invalid virtual background mode');
  }

  // Update virtual background settings
  if (typeof backgroundData.enabled !== 'undefined') {
    user.virtualBackground.enabled = backgroundData.enabled;
  }
  if (backgroundData.mode) {
    user.virtualBackground.mode = backgroundData.mode;
  }
  if (backgroundData.imageUrl !== undefined) {
    user.virtualBackground.imageUrl = backgroundData.imageUrl;
  }
  if (backgroundData.blurAmount !== undefined) {
    const amount = parseInt(backgroundData.blurAmount);
    if (amount < 0 || amount > 20) {
      throw new Error('Blur amount must be between 0 and 20');
    }
    user.virtualBackground.blurAmount = amount;
  }

  await user.save();
  return user;
};

module.exports = {
  createUser,
  authenticateUser,
  getUserProfile,
  updateUserProfile,
  getUserDashboard,
  getUserById,
  trackStudyTime,
  getLeaderboard,
  recoverStreak,
  updateVirtualBackground
};
