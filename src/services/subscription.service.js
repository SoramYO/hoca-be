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

// Configurable tier limits - NOT hard-coded, can be easily modified
const TIER_LIMITS = {
    FREE: {
        dailyStudyMinutes: 180,        // 3 hours/day total
        roomsPerDay: 2,                 // Max 2 rooms per day
        roomDurationMinutes: 60,        // Auto-close after 60 min
        requireSequentialRooms: true,   // Must close current before creating new
        warningBeforeKickMinutes: 5     // Warn 5 min before kick
    },
    MONTHLY: {
        dailyStudyMinutes: Infinity,
        roomsPerDay: 10,                // Max 10 rooms per day
        roomDurationMinutes: Infinity,  // No auto-close
        requireSequentialRooms: false,
        warningBeforeKickMinutes: 0
    },
    YEARLY: {
        dailyStudyMinutes: Infinity,
        roomsPerDay: Infinity,          // Unlimited
        roomDurationMinutes: Infinity,
        requireSequentialRooms: false,
        warningBeforeKickMinutes: 0
    },
    LIFETIME: {
        dailyStudyMinutes: Infinity,
        roomsPerDay: Infinity,          // Unlimited
        roomDurationMinutes: Infinity,
        requireSequentialRooms: false,
        warningBeforeKickMinutes: 0
    }
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

// Early access features list - can be configured dynamically
const EARLY_ACCESS_FEATURES = [
    // Add feature names here that are only available to LIFETIME users first
    // Example: 'new_pomodoro_mode', 'ai_study_assistant'
];

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
 * Get tier limits configuration
 * @param {string} tier 
 * @returns {Object}
 */
const getTierLimits = (tier) => {
    return TIER_LIMITS[tier] || TIER_LIMITS.FREE;
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
 * Check if feature is in early access (only for LIFETIME)
 * @param {string} featureName 
 * @returns {boolean}
 */
const isEarlyAccessFeature = (featureName) => {
    return EARLY_ACCESS_FEATURES.includes(featureName);
};

/**
 * Check if user can access early access feature
 * @param {Object} user 
 * @param {string} featureName 
 * @returns {boolean}
 */
const canAccessEarlyFeature = (user, featureName) => {
    if (!user) return false;
    if (user.role === 'ADMIN') return true;

    if (!isEarlyAccessFeature(featureName)) return true; // Not early access, available to all

    const tier = getEffectiveTier(user);
    return tier === 'LIFETIME';
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
 * Get room creation limit per day for user's tier
 * @param {Object} user - User document
 * @returns {number}
 */
const getRoomLimit = (user) => {
    if (!user) return TIER_LIMITS.FREE.roomsPerDay;
    if (user.role === 'ADMIN') return Infinity;

    const tier = getEffectiveTier(user);
    return getTierLimits(tier).roomsPerDay;
};

/**
 * Get room duration limit for user's tier (in minutes)
 * @param {Object} user 
 * @returns {number}
 */
const getRoomDurationLimit = (user) => {
    if (!user) return TIER_LIMITS.FREE.roomDurationMinutes;
    if (user.role === 'ADMIN') return Infinity;

    const tier = getEffectiveTier(user);
    return getTierLimits(tier).roomDurationMinutes;
};

/**
 * Check if user requires sequential room creation (must close current before creating new)
 * @param {Object} user 
 * @returns {boolean}
 */
const requiresSequentialRooms = (user) => {
    if (!user) return true;
    if (user.role === 'ADMIN') return false;

    const tier = getEffectiveTier(user);
    return getTierLimits(tier).requireSequentialRooms;
};

/**
 * Helper: Check if same day
 */
const isSameDay = (date1, date2) => {
    if (!date1 || !date2) return false;
    return date1.getDate() === date2.getDate() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getFullYear() === date2.getFullYear();
};

/**
 * Check if FREE user can create a new room
 * @param {Object} user - User document
 * @returns {{ canCreate: boolean, reason?: string }}
 */
const checkRoomCreationEligibility = (user) => {
    if (!user) return { canCreate: false, reason: 'User not found' };
    if (user.role === 'ADMIN') return { canCreate: true };

    const tier = getEffectiveTier(user);
    const limits = getTierLimits(tier);

    const now = new Date();
    const isNewDay = !isSameDay(user.lastRoomCreatedDate, now);
    const todayCount = isNewDay ? 0 : (user.todayRoomCreatedCount || 0);

    // Check daily limit
    if (todayCount >= limits.roomsPerDay) {
        if (tier === 'FREE') {
            return {
                canCreate: false,
                reason: `Bạn đã tạo đủ ${limits.roomsPerDay} phòng miễn phí hôm nay. Nâng cấp HOCA+ để tạo thêm phòng!`
            };
        } else if (tier === 'MONTHLY') {
            return {
                canCreate: false,
                reason: `Bạn đã tạo đủ ${limits.roomsPerDay} phòng hôm nay. Nâng cấp HOCA+ Năm để tạo không giới hạn!`
            };
        }
    }

    // Check sequential requirement (FREE tier)
    if (limits.requireSequentialRooms && user.activePersonalRoomId) {
        return {
            canCreate: false,
            reason: 'Bạn cần đóng phòng hiện tại trước khi tạo phòng mới. User FREE chỉ được mở 1 phòng tại một thời điểm.'
        };
    }

    return { canCreate: true };
};

/**
 * Check if FREE user can join a room (based on daily study time limit)
 * @param {Object} user - User document
 * @returns {{ canJoin: boolean, reason?: string, remainingMinutes?: number }}
 */
const checkJoinRoomEligibility = (user) => {
    if (!user) return { canJoin: false, reason: 'User not found' };
    if (user.role === 'ADMIN') return { canJoin: true };

    const tier = getEffectiveTier(user);

    // Paid users have no limits
    if (tier !== 'FREE') {
        return { canJoin: true };
    }

    const limits = getTierLimits(tier);
    const now = new Date();
    const isNewDay = !isSameDay(user.lastRoomDate, now);
    const todayMinutes = isNewDay ? 0 : (user.todayRoomMinutes || 0);
    const remainingMinutes = limits.dailyStudyMinutes - todayMinutes;

    if (remainingMinutes <= 0) {
        return {
            canJoin: false,
            reason: `Bạn đã sử dụng hết ${limits.dailyStudyMinutes / 60} giờ học miễn phí hôm nay. Nâng cấp HOCA+ để học không giới hạn!`,
            remainingMinutes: 0
        };
    }

    return {
        canJoin: true,
        remainingMinutes
    };
};

/**
 * Calculate remaining daily study time for user
 * @param {Object} user - User document
 * @returns {{ remainingMinutes: number, shouldWarn: boolean, shouldKick: boolean }}
 */
const getDailyStudyTimeStatus = (user) => {
    const tier = getEffectiveTier(user);

    if (tier !== 'FREE') {
        return { remainingMinutes: Infinity, shouldWarn: false, shouldKick: false };
    }

    const limits = getTierLimits(tier);
    const now = new Date();
    const isNewDay = !isSameDay(user.lastRoomDate, now);
    const todayMinutes = isNewDay ? 0 : (user.todayRoomMinutes || 0);

    // Calculate remaining based on current session too
    let sessionMinutes = 0;
    if (user.currentSessionStartTime) {
        const sessionStart = new Date(user.currentSessionStartTime);
        sessionMinutes = (now - sessionStart) / (1000 * 60);
    }

    const totalUsed = todayMinutes + sessionMinutes;
    const remainingMinutes = Math.max(0, limits.dailyStudyMinutes - totalUsed);

    const shouldWarn = remainingMinutes <= limits.warningBeforeKickMinutes && remainingMinutes > 0;
    const shouldKick = remainingMinutes <= 0;

    return { remainingMinutes: Math.ceil(remainingMinutes), shouldWarn, shouldKick };
};

/**
 * Get tier display info for UI
 * @param {string} tier 
 * @returns {Object}
 */
const getTierInfo = (tier) => {
    const limits = getTierLimits(tier);

    const info = {
        FREE: {
            name: 'Free',
            color: 'gray',
            icon: 'person',
            features: [
                `Học tối đa ${limits.dailyStudyMinutes / 60} giờ/ngày`,
                `Tối đa ${limits.roomsPerDay} phòng/ngày (${limits.roomDurationMinutes} phút/phòng)`,
                'Pomodoro cơ bản',
                'Chuỗi học tập cơ bản'
            ]
        },
        MONTHLY: {
            name: 'HOCA+ Tháng',
            color: 'blue',
            icon: 'workspace_premium',
            features: [
                'Học không giới hạn thời gian',
                'Không quảng cáo',
                `Tối đa ${TIER_LIMITS.MONTHLY.roomsPerDay} phòng/ngày`,
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
                'Cập nhật sớm nhất (Early Access)',
                'Badge độc quyền',
                'Hỗ trợ VIP'
            ]
        }
    };

    return info[tier] || info.FREE;
};

// Legacy exports for backward compatibility
const FREE_TIER_LIMITS = TIER_LIMITS.FREE;
const ROOM_LIMITS = {
    FREE: TIER_LIMITS.FREE.roomsPerDay,
    MONTHLY: TIER_LIMITS.MONTHLY.roomsPerDay,
    YEARLY: TIER_LIMITS.YEARLY.roomsPerDay,
    LIFETIME: TIER_LIMITS.LIFETIME.roomsPerDay
};

module.exports = {
    TIER_LEVELS,
    TIER_LIMITS,
    FEATURE_ACCESS,
    EARLY_ACCESS_FEATURES,
    ROOM_LIMITS,
    FREE_TIER_LIMITS,
    PRICING,
    // Core functions
    getTierLimits,
    canAccessFeature,
    isEarlyAccessFeature,
    canAccessEarlyFeature,
    getEffectiveTier,
    // Room functions
    getRoomLimit,
    getRoomDurationLimit,
    requiresSequentialRooms,
    checkRoomCreationEligibility,
    // Join room functions
    checkJoinRoomEligibility,
    getDailyStudyTimeStatus,
    // UI functions
    getTierInfo,
    // Legacy (deprecated, use new functions)
    checkFreeUserSessionEligibility: checkJoinRoomEligibility,
    getSessionTimeStatus: getDailyStudyTimeStatus
};
