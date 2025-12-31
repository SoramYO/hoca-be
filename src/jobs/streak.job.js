const cron = require('node-cron');
const User = require('../models/User');

const initJobs = () => {
  // Run every day at midnight
  cron.schedule('0 0 * * *', async () => {
    console.log('Running daily streak maintenance...');
    try {
      // 1. Reset daily study minutes for ALL users
      // Ideally this should be done efficiently
      await User.updateMany({}, { totalStudyMinutes: 0 }); 
      // WAIT! totalStudyMinutes tracks LIFETIME? Or Daily?
      // Requirement: "Hiển thị tổng số giờ đã học" -> Lifetime.
      // "Thiết lập mục tiêu học tập (ví dụ: Số giờ học mục tiêu mỗi ngày)" -> Daily Goal.
      // We need a separate 'dailyStudyMinutes' field if we want to reset it?
      // Or we calculate daily minutes from StudySessions.
      
      // Let's assume we use aggregated StudySessions for daily progress.
      // So no need to reset 'totalStudyMinutes'.
      
      // 2. Check Streak Break
      // If user lastStudyDate < Yesterday, reset streak to 0.
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      // Users who haven't studied since before yesterday (meaning they skipped yesterday)
      // And have a streak > 0
      const brokenStreakUsers = await User.updateMany(
        { 
          lastStudyDate: { $lt: yesterday },
          currentStreak: { $gt: 0 }
        },
        { currentStreak: 0 }
      );
      
    } catch (err) {
      console.error('Error in daily job:', err);
    }
  });
};

module.exports = initJobs;
