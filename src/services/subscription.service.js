/**
 * Subscription Service
 * Handles tier-based feature access control and subscription management
 */

const User = require('../models/User');

// Tier hierarchy for comparisons
const TIER_LEVELS = {
    FREE: 0,
    MONTHLY: 1,
    YEARLY: 2,
    LIFETIME: 3
};

// Feature access matrix
const FEATURE_ACCESS = {
    // Chat in rooms
    chat: ['MONTHLY', 'YEARLY', 'LIFETIME'],

    // Background features
    background_preset: ['MONTHLY', 'YEARLY', 'LIFETIME'],
    background_upload: ['YEARLY', 'LIFETIME'],

    // Time limits
    unlimited_study_time: ['MONTHLY', 'YEARLY', 'LIFETIME'],
    unlimited_sessions: ['MONTHLY', 'YEARLY', 'LIFETIME'],

    // Room limits
    unlimited_rooms: ['YEARLY', 'LIFETIME'],

    // Premium perks
    no_ads: ['MONTHLY', 'YEARLY', 'LIFETIME'],
    early_access: ['LIFETIME'],
};

// Room limits by tier
const ROOM_LIMITS = {
    FREE: 2,
    MONTHLY: 10,
    YEARLY: Infinity,
    LIFETIME: Infinity
};

// Session limits for FREE tier
const FREE_TIER_LIMITS = {
    sessionDurationMinutes: 60,
    sessionsPerDay: 2,
    warningBeforeKickMinutes: 5
};

// Pricing (VND)
const PRICING = {
    MONTHLY: {
        price: 79000,
        durationDays: 30,
        name: 'HOCA+ 1 Tháng',
        description: 'Không quảng cáo, học không giới hạn'
    },
    YEARLY: {
        price: 599000,
        durationDays: 365,
        name: 'HOCA+ 1 Năm',
        description: 'Tiết kiệm 37%, mở khóa tất cả tính năng'
    },
    LIFETIME: {
        price: 1499000,
        durationDays: -1, // Never expires
        name: 'HOCA+ Vĩnh Viễn',
        description: 'Một lần mua, dùng trọn đời'
    }
};

/**
 * Check if user can access a specific feature
 * @param {Object} user - User document
 * @param {string} feature - Feature key from FEATURE_ACCESS
 * @returns {boolean}
 */
const canAccessFeature = (user, feature) => {
    if (!user) return false;

    // Admin always has access
    if (user.role === 'ADMIN') return true;

    const tier = getEffectiveTier(user);
    const allowedTiers = FEATURE_ACCESS[feature];

    if (!allowedTiers) return false;
    return allowedTiers.includes(tier);
};

/**
 * Get user's effective subscription tier (considers expiry)
 * @param {Object} user - User document
 * @returns {string} - Effective tier
 */
const getEffectiveTier = (user) => {
    if (!user) return 'FREE';

    const tier = user.subscriptionTier || 'FREE';

    // LIFETIME never expires
    if (tier === 'LIFETIME') return 'LIFETIME';

    // FREE is always FREE
    if (tier === 'FREE') return 'FREE';

    // Check expiry for MONTHLY/YEARLY
    if (user.subscriptionExpiry && new Date(user.subscriptionExpiry) < new Date()) {
        return 'FREE';
    }

    return tier;
};

/**
 * Get room creation limit for user's tier
 * @param {Object} user - User document
 * @returns {number}
 */
const getRoomLimit = (user) => {
    if (!user) return ROOM_LIMITS.FREE;
    if (user.role === 'ADMIN') return Infinity;

    const tier = getEffectiveTier(user);
    return ROOM_LIMITS[tier] || ROOM_LIMITS.FREE;
};

/**
 * Check if FREE user can start a new session
 * @param {Object} user - User document
 * @returns {{ canJoin: boolean, reason?: string, remainingSessions?: number }}
 */
const checkFreeUserSessionEligibility = (user) => {
    const tier = getEffectiveTier(user);

    // Paid users have no session limits
    if (tier !== 'FREE') {
        return { canJoin: true };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Check if session count needs reset (new day)
    const lastSessionDate = user.lastSessionDate ? new Date(user.lastSessionDate) : null;
    const isNewDay = !lastSessionDate || lastSessionDate < today;

    const sessionCount = isNewDay ? 0 : (user.todaySessionCount || 0);
    const remainingSessions = FREE_TIER_LIMITS.sessionsPerDay - sessionCount;

    if (remainingSessions <= 0) {
        return {
            canJoin: false,
            reason: `Bạn đã sử dụng hết ${FREE_TIER_LIMITS.sessionsPerDay} phiên học miễn phí hôm nay. Nâng cấp HOCA+ để học không giới hạn!`,
            remainingSessions: 0
        };
    }

    return {
        canJoin: true,
        remainingSessions
    };
};

/**
 * Calculate remaining session time for FREE user
 * @param {Object} user - User document
 * @returns {{ remainingMinutes: number, shouldWarn: boolean, shouldKick: boolean }}
 */
const getSessionTimeStatus = (user) => {
    const tier = getEffectiveTier(user);

    if (tier !== 'FREE') {
        return { remainingMinutes: Infinity, shouldWarn: false, shouldKick: false };
    }

    if (!user.currentSessionStartTime) {
        return { remainingMinutes: FREE_TIER_LIMITS.sessionDurationMinutes, shouldWarn: false, shouldKick: false };
    }

    const sessionStart = new Date(user.currentSessionStartTime);
    const now = new Date();
    const elapsedMinutes = (now - sessionStart) / (1000 * 60);
    const remainingMinutes = Math.max(0, FREE_TIER_LIMITS.sessionDurationMinutes - elapsedMinutes);

    const shouldWarn = remainingMinutes <= FREE_TIER_LIMITS.warningBeforeKickMinutes && remainingMinutes > 0;
    const shouldKick = remainingMinutes <= 0;

    return { remainingMinutes: Math.ceil(remainingMinutes), shouldWarn, shouldKick };
};

/**
 * Get tier display info for UI
 * @param {string} tier 
 * @returns {Object}
 */
const getTierInfo = (tier) => {
    const info = {
        FREE: {
            name: 'Free',
            color: 'gray',
            icon: 'person',
            features: [
                '60 phút/phiên, 2 phiên/ngày',
                'Tối đa 2 phòng sở hữu',
                'Pomodoro cơ bản'
            ]
        },
        MONTHLY: {
            name: 'HOCA+ Tháng',
            color: 'blue',
            icon: 'workspace_premium',
            features: [
                'Học không giới hạn thời gian',
                'Không quảng cáo',
                'Tối đa 10 phòng sở hữu',
                'Background học tập có sẵn',
                'Chat trong phòng'
            ]
        },
        YEARLY: {
            name: 'HOCA+ Năm',
            color: 'purple',
            icon: 'diamond',
            features: [
                'Tất cả tính năng gói Tháng',
                'Phòng không giới hạn',
                'Upload background riêng',
                'Ưu tiên hỗ trợ'
            ]
        },
        LIFETIME: {
            name: 'HOCA+ Vĩnh Viễn',
            color: 'amber',
            icon: 'stars',
            features: [
                'Tất cả tính năng mãi mãi',
                'Cập nhật sớm nhất',
                'Badge độc quyền',
                'Hỗ trợ VIP'
            ]
        }
    };

    return info[tier] || info.FREE;
};

module.exports = {
    TIER_LEVELS,
    FEATURE_ACCESS,
    ROOM_LIMITS,
    FREE_TIER_LIMITS,
    PRICING,
    canAccessFeature,
    getEffectiveTier,
    getRoomLimit,
    checkFreeUserSessionEligibility,
    getSessionTimeStatus,
    getTierInfo
};
