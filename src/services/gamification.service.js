const Badge = require('../models/Badge');
const User = require('../models/User');

const checkAndAwardBadges = async (userId) => {
  const user = await User.findById(userId).populate('badges');
  if (!user) return;

  const earnedBadgeIds = user.badges.map(b => b._id.toString());
  
  // Fetch all badges
  const allBadges = await Badge.find({});
  
  const newBadges = [];

  for (const badge of allBadges) {
    if (earnedBadgeIds.includes(badge._id.toString())) continue;

    let qualified = false;
    
    switch (badge.type) {
      case 'STREAK':
        if (user.currentStreak >= badge.threshold) qualified = true;
        break;
      case 'STUDY_HOURS':
        if ((user.totalStudyMinutes / 60) >= badge.threshold) qualified = true;
        break;
      // Add more types
    }

    if (qualified) {
      user.badges.push(badge._id);
      newBadges.push(badge);
    }
  }

  if (newBadges.length > 0) {
    await user.save();
    return newBadges;
  }
  
  return null;
};

// Check if user has studied enough today (e.g., 60 mins) to increment streak
const updateDailyStreak = async (userId) => {
  const user = await User.findById(userId);
  const today = new Date();
  today.setHours(0,0,0,0);
  
  // If already updated today
  if (user.lastStudyDate && user.lastStudyDate >= today) return;
  
  // Logic: 1 streak = 1 hour/day
  // Need to calculate distinct minutes studied TODAY?
  // Since totalStudyMinutes is global, we need 'minutesStudiedToday'.
  // We can aggregate StudySession for today.
  
  // For simplicity, let's assume this function is called when a session ends.
  // We need to query sessions from today.
  
  // Returning plain func for now, logic to be implemented with aggregation.
};

module.exports = {
  checkAndAwardBadges,
  updateDailyStreak
};
