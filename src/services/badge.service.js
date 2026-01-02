const Badge = require('../models/Badge');
const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Check user progress and unlock any new badges
 * @param {string} userId - User ID
 * @param {object} io - Socket.io instance (optional, for real-time notification)
 * @returns {Promise<{newBadges: Badge[]}>} - Array of newly unlocked badges
 */
const checkAndUnlockBadges = async (userId, io = null) => {
    try {
        const user = await User.findById(userId).populate('badges');
        if (!user) return { newBadges: [] };

        // Get all badges
        const allBadges = await Badge.find().sort({ threshold: 1 });
        const earnedBadgeIds = user.badges.map(b => b._id.toString());

        const newBadges = [];

        // Calculate user stats
        const totalStudyHours = Math.floor(user.totalStudyMinutes / 60);
        const currentStreak = user.currentStreak || 0;

        for (const badge of allBadges) {
            // Skip if already earned
            if (earnedBadgeIds.includes(badge._id.toString())) continue;

            let qualifies = false;

            // Check qualification based on badge type
            if (badge.type === 'STREAK' && currentStreak >= badge.threshold) {
                qualifies = true;
            } else if (badge.type === 'STUDY_HOURS' && totalStudyHours >= badge.threshold) {
                qualifies = true;
            }

            if (qualifies) {
                // Add badge to user
                user.badges.push(badge._id);
                newBadges.push(badge);

                // Create notification
                await Notification.create({
                    user: userId,
                    type: 'BADGE_UNLOCK',
                    title: 'Huy hiệu mới!',
                    message: `Bạn đã mở khóa "${badge.name}"`,
                    icon: badge.icon,
                    data: { badgeId: badge._id, badgeName: badge.name }
                });
            }
        }

        // Save user if new badges were earned
        if (newBadges.length > 0) {
            await user.save();

            // Emit socket event for real-time notification
            if (io) {
                io.to(`user:${userId}`).emit('badge:unlocked', {
                    badges: newBadges
                });
            }
        }

        return { newBadges };
    } catch (error) {
        console.error('Error checking badges:', error);
        return { newBadges: [] };
    }
};

/**
 * Get all badges with user's progress
 * @param {string} userId - User ID
 * @returns {Promise<{allBadges: Badge[], earnedBadges: Badge[]}>}
 */
const getUserBadgesWithProgress = async (userId) => {
    try {
        const user = await User.findById(userId).populate('badges');
        const allBadges = await Badge.find().sort({ type: 1, threshold: 1 });

        const earnedBadgeIds = user?.badges?.map(b => b._id.toString()) || [];

        // Calculate user stats for progress
        const totalStudyHours = Math.floor((user?.totalStudyMinutes || 0) / 60);
        const currentStreak = user?.currentStreak || 0;

        const badgesWithProgress = allBadges.map(badge => {
            const isEarned = earnedBadgeIds.includes(badge._id.toString());
            let progress = 0;

            if (badge.type === 'STREAK') {
                progress = Math.min((currentStreak / badge.threshold) * 100, 100);
            } else if (badge.type === 'STUDY_HOURS') {
                progress = Math.min((totalStudyHours / badge.threshold) * 100, 100);
            }

            return {
                ...badge.toObject(),
                isEarned,
                progress: Math.round(progress)
            };
        });

        return {
            allBadges: badgesWithProgress,
            earnedBadges: user?.badges || [],
            stats: {
                totalStudyHours,
                currentStreak
            }
        };
    } catch (error) {
        console.error('Error getting user badges:', error);
        return { allBadges: [], earnedBadges: [], stats: {} };
    }
};

module.exports = {
    checkAndUnlockBadges,
    getUserBadgesWithProgress
};
