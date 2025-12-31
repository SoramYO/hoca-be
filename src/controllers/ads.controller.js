const AdConfig = require('../models/AdConfig');
const AdPlacement = require('../models/AdPlacement');
const AdView = require('../models/AdView');
const User = require('../models/User');

// ===== HELPER FUNCTIONS =====

// Weighted random selection algorithm
const getRandomAdByPriority = (ads) => {
    if (ads.length === 0) return null;
    if (ads.length === 1) return ads[0];

    const totalWeight = ads.reduce((sum, ad) => sum + ad.priority, 0);
    let random = Math.random() * totalWeight;

    for (const ad of ads) {
        random -= ad.priority;
        if (random <= 0) return ad;
    }
    return ads[0];
};

// Map position key to match DB enum values
const mapPositionKey = (key) => {
    const mapping = {
        'preRoom': 'pre-room',
        'pre-room': 'pre-room',
        'banner': 'banner',
        'popup': 'popup'
    };
    return mapping[key] || key;
};

// ===== ADMIN ENDPOINTS =====

// Get ad configuration
const getAdConfig = async (req, reply) => {
    try {
        const config = await AdConfig.getConfig();
        reply.send(config);
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

// Update ad configuration
const updateAdConfig = async (req, reply) => {
    try {
        const {
            adFrequency,
            maxAdsPerUser,
            vipExemption,
            isActive,
            positions,
            streakRecoveryEnabled,
            streakRecoveryAdDuration,
            streakRecoverySourceType,
            streakRecoveryContent,
            streakRecoveryCooldownDays
        } = req.body;

        let config = await AdConfig.findOne();
        if (!config) {
            config = new AdConfig();
        }

        if (adFrequency !== undefined) config.adFrequency = adFrequency;
        if (maxAdsPerUser !== undefined) config.maxAdsPerUser = maxAdsPerUser;
        if (vipExemption !== undefined) config.vipExemption = vipExemption;
        if (isActive !== undefined) config.isActive = isActive;

        // Position-specific settings
        if (positions) {
            if (!config.positions) {
                config.positions = {};
            }
            if (positions.preRoom) {
                config.positions.preRoom = { ...config.positions.preRoom, ...positions.preRoom };
            }
            if (positions.banner) {
                config.positions.banner = { ...config.positions.banner, ...positions.banner };
            }
            if (positions.popup) {
                config.positions.popup = { ...config.positions.popup, ...positions.popup };
            }
        }

        // Streak recovery settings
        if (streakRecoveryEnabled !== undefined) config.streakRecoveryEnabled = streakRecoveryEnabled;
        if (streakRecoveryAdDuration !== undefined) config.streakRecoveryAdDuration = streakRecoveryAdDuration;
        if (streakRecoverySourceType !== undefined) config.streakRecoverySourceType = streakRecoverySourceType;
        if (streakRecoveryContent !== undefined) config.streakRecoveryContent = streakRecoveryContent;
        if (streakRecoveryCooldownDays !== undefined) config.streakRecoveryCooldownDays = streakRecoveryCooldownDays;

        await config.save();
        reply.send({ message: 'Configuration updated', config });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

// Get all placements
const getAllPlacements = async (req, reply) => {
    try {
        const placements = await AdPlacement.find().sort('-createdAt');
        reply.send(placements);
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

// Create placement
const createPlacement = async (req, reply) => {
    try {
        const placement = new AdPlacement(req.body);
        await placement.save();
        reply.code(201).send(placement);
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

// Update placement
const updatePlacement = async (req, reply) => {
    try {
        const { id } = req.params;
        const placement = await AdPlacement.findByIdAndUpdate(id, req.body, { new: true });
        if (!placement) {
            return reply.code(404).send({ message: 'Placement not found' });
        }
        reply.send(placement);
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

// Delete placement
const deletePlacement = async (req, reply) => {
    try {
        const { id } = req.params;
        const placement = await AdPlacement.findByIdAndDelete(id);
        if (!placement) {
            return reply.code(404).send({ message: 'Placement not found' });
        }
        reply.send({ message: 'Placement deleted' });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

// Toggle placement status
const togglePlacementStatus = async (req, reply) => {
    try {
        const { id } = req.params;
        const placement = await AdPlacement.findById(id);
        if (!placement) {
            return reply.code(404).send({ message: 'Placement not found' });
        }

        placement.status = placement.status === 'Active' ? 'Paused' : 'Active';
        await placement.save();
        reply.send(placement);
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

// Toggle placement enabled/disabled
const togglePlacementEnabled = async (req, reply) => {
    try {
        const { id } = req.params;
        const placement = await AdPlacement.findById(id);
        if (!placement) {
            return reply.code(404).send({ message: 'Placement not found' });
        }

        placement.isEnabled = !placement.isEnabled;
        await placement.save();
        reply.send(placement);
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

// Get ad statistics
const getAdStats = async (req, reply) => {
    try {
        const config = await AdConfig.getConfig();
        const placements = await AdPlacement.find();

        // Aggregate stats from placements
        const totalViews = placements.reduce((sum, p) => sum + (p.totalViews || 0), 0);
        const totalClicks = placements.reduce((sum, p) => sum + (p.totalClicks || 0), 0);
        const ctr = totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(2) : 0;
        const activeCampaigns = placements.filter(p => p.status === 'Active' && p.isEnabled).length;

        // Estimated revenue (CPM-based calculation using totalViews)
        const revenue = placements.reduce((sum, p) => sum + ((p.totalViews || 0) / 1000) * p.cpm, 0);

        reply.send({
            views: totalViews,
            ctr: parseFloat(ctr),
            revenue: Math.round(revenue),
            activeCampaigns,
            placements: placements.map(p => ({
                id: p._id,
                name: p.name,
                description: p.description,
                adType: p.adType,
                content: p.content,
                embedCode: p.embedCode,
                // Map new fields
                positions: p.positions,
                contents: p.contents,
                targetUrl: p.targetUrl, // Root targetUrl
                targeting: p.targeting,

                status: p.status,
                isEnabled: p.isEnabled,

                // Use total metrics
                totalViews: p.totalViews,
                totalClicks: p.totalClicks,
                ctr: p.ctr,
                cpm: p.cpm || 0,

                startDate: p.startDate,
                endDate: p.endDate
            })),
            config
        });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

// Get ad view analytics for admin
const getAdViewStats = async (req, reply) => {
    try {
        const { adId, userId, from, to, page = 1, limit = 50, sortBy = 'viewedAt', order = 'desc' } = req.query;

        const query = {};
        if (adId) query.adId = adId;
        if (userId) query.userId = userId;
        if (from || to) {
            query.viewedAt = {};
            if (from) query.viewedAt.$gte = new Date(from);
            if (to) query.viewedAt.$lte = new Date(to);
        }

        const skip = (page - 1) * limit;

        const sort = {};
        sort[sortBy] = order === 'asc' ? 1 : -1;

        const [views, total] = await Promise.all([
            AdView.find(query)
                .populate('userId', 'displayName email avatar')
                .populate('adId', 'name adType position')
                .sort(sort)
                .skip(skip)
                .limit(parseInt(limit)),
            AdView.countDocuments(query)
        ]);

        // Aggregate stats
        const aggregateStats = await AdView.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalViews: { $sum: 1 },
                    totalClicks: { $sum: { $cond: ['$clicked', 1, 0] } },
                    avgDuration: { $avg: '$duration' },
                    completedCount: { $sum: { $cond: ['$completed', 1, 0] } }
                }
            }
        ]);

        const stats = aggregateStats[0] || { totalViews: 0, totalClicks: 0, avgDuration: 0, completedCount: 0 };

        reply.send({
            views,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit),
            stats: {
                totalViews: stats.totalViews,
                totalClicks: stats.totalClicks,
                avgDuration: Math.round(stats.avgDuration || 0),
                completionRate: stats.totalViews > 0
                    ? ((stats.completedCount / stats.totalViews) * 100).toFixed(1)
                    : 0,
                ctr: stats.totalViews > 0
                    ? ((stats.totalClicks / stats.totalViews) * 100).toFixed(2)
                    : 0
            }
        });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

// ===== USER-FACING ENDPOINTS =====

// ===== USER-FACING ENDPOINTS =====

// Get ad for specific position (weighted random based on priority)
const getAdForPosition = async (req, reply) => {
    try {
        const { position } = req.params; // pre-room, banner, popup
        const userId = req.user.id;

        const config = await AdConfig.getConfig();

        // Check global ads toggle
        if (!config.isActive) {
            return reply.send({ ad: null, reason: 'ads_disabled' });
        }
        const user = await User.findById(userId);
        if (!user) {
            return reply.send({ ad: null, reason: 'user_not_found' });
        }

        // Check VIP exemption
        if (config.vipExemption && user.isPremium) {
            return reply.send({ ad: null, reason: 'vip_exempt' });
        }

        // Map position key
        const positionKey = position === 'pre-room' ? 'preRoom' : position;
        const positionConfig = config.positions?.[positionKey];

        // Check position enabled in global config
        if (!positionConfig?.enabled) {
            return reply.send({ ad: null, reason: 'position_disabled' });
        }

        // Get allowed types for this position (default to all if empty)
        const allowedTypes = positionConfig.allowedTypes?.length > 0
            ? positionConfig.allowedTypes
            : ['image', 'video', 'embed'];

        const dbPosition = mapPositionKey(position);

        // Get active ads for this position
        const ads = await AdPlacement.getAdsForPosition(dbPosition);

        // Filter by allowed types (Ad must have at least one content of allowed type)
        const allowedAds = ads.filter(ad =>
            ad.contents && ad.contents.some(c => allowedTypes.includes(c.type))
        );

        if (allowedAds.length === 0) {
            return reply.send({ ad: null, reason: 'no_ads' });
        }

        // Setup weighted random selection based on position-specific priority
        const positionAds = allowedAds.map(ad => {
            const posConfig = ad.positions.find(p => p.position === dbPosition && p.isEnabled);
            // Default priority 1 if something is wrong, though query filters ensures isEnabled
            return {
                ad,
                priority: posConfig?.priority || 1
            };
        });

        // Weighted random selection for AD
        const totalWeight = positionAds.reduce((sum, item) => sum + item.priority, 0);
        let random = Math.random() * totalWeight;
        let selectedAd = null;

        for (const item of positionAds) {
            random -= item.priority;
            if (random <= 0) {
                selectedAd = item.ad;
                break;
            }
        }

        // Fallback
        if (!selectedAd && positionAds.length > 0) {
            selectedAd = positionAds[0].ad;
        }

        if (!selectedAd) {
            return reply.send({ ad: null, reason: 'no_ad_selected' });
        }

        // Select CONTENT (Creative) using weighted random, filtering by allowed types
        const validContents = selectedAd.contents.filter(c => allowedTypes.includes(c.type));

        let selectedContent = null;
        if (validContents.length > 0) {
            const contentWeight = validContents.reduce((sum, c) => sum + c.priority, 0);
            let rnd = Math.random() * contentWeight;
            for (const c of validContents) {
                rnd -= c.priority;
                if (rnd <= 0) {
                    selectedContent = c;
                    break;
                }
            }
            // Fallback
            if (!selectedContent) selectedContent = validContents[0];
        }

        if (!selectedContent) {
            return reply.send({ ad: null, reason: 'no_valid_content' });
        }

        reply.send({
            ad: {
                id: selectedAd._id,
                contentId: selectedContent._id,
                name: selectedAd.name,
                adType: selectedContent.type,
                content: selectedContent.content,
                embedCode: selectedContent.embedCode,
                targetUrl: selectedAd.targetUrl, // Single target URL
                priority: 0 // Priority is handled server-side now
            },
            config: {
                duration: positionConfig.defaultDuration,
                rotationInterval: positionConfig.rotationInterval,
                frequency: positionConfig.frequency
            }
        });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

// Record ad view start
const recordAdView = async (req, reply) => {
    try {
        const { adId, position, targetUrl, contentId } = req.body; // Added contentId
        const userId = req.user?.id; // Use optional chaining to be safe (though middleware should handle) || req.user?._id

        if (!adId) {
            return reply.code(400).send({ message: 'adId is required' });
        }

        // If no user, skip tracking but don't fail
        if (!userId) {
            return reply.send({ viewId: null, message: 'anonymous_view' });
        }

        const adView = new AdView({
            userId,
            adId,
            position,
            targetUrl,
            contentId: contentId, // Save contentId
            userAgent: req.headers['user-agent']
        });

        await adView.save();

        // Increment views count on AdPlacement (Position specific and Content specific)
        const ad = await AdPlacement.findById(adId);
        if (ad) {
            await ad.trackView(position, contentId);
        }

        reply.send({ viewId: adView._id });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

// Update ad view (duration, completed, clicked)
const updateAdView = async (req, reply) => {
    try {
        const { viewId } = req.params;
        const { duration, completed, clicked } = req.body;

        const update = {};
        if (duration !== undefined) update.duration = duration;
        if (completed !== undefined) update.completed = completed;

        if (clicked) {
            update.clicked = true;
            update.clickedAt = new Date();

            // Increment clicks count on AdPlacement
            const view = await AdView.findById(viewId);
            if (view) {
                const ad = await AdPlacement.findById(view.adId);
                if (ad) {
                    // Track click for specific content/position
                    await ad.trackClick(view.position, view.contentId);
                }
            }
        }

        await AdView.findByIdAndUpdate(viewId, update);
        reply.send({ success: true });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

// Get ads config for user (with premium check)
const getUserAdsConfig = async (req, reply) => {
    try {
        const config = await AdConfig.getConfig();
        const userId = req.user?.id;

        let isPremium = false;
        if (userId) {
            const user = await User.findById(userId);
            isPremium = user?.isPremium || false;
        }

        reply.send({
            isPremium,
            isActive: config.isActive && !(config.vipExemption && isPremium),
            positions: config.positions,
            streakRecovery: {
                enabled: config.streakRecoveryEnabled,
                adDuration: config.streakRecoveryAdDuration,
                sourceType: config.streakRecoverySourceType,
                content: config.streakRecoveryContent,
                cooldownDays: config.streakRecoveryCooldownDays
            }
        });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

// Get active ads list (legacy support)
const getActiveAds = async (req, reply) => {
    try {
        const config = await AdConfig.getConfig();
        const userId = req.user?.id;

        // Check VIP exemption
        if (config.vipExemption && userId) {
            const user = await User.findById(userId);
            if (user?.isPremium) {
                return reply.send({ ads: [], config: { isActive: false } });
            }
        }

        const placements = await AdPlacement.find({
            status: 'Active',
            isEnabled: true
        });

        reply.send({
            ads: placements,
            config: {
                isActive: config.isActive,
                frequency: config.adFrequency,
                maxPerDay: config.maxAdsPerUser
            }
        });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

module.exports = {
    // Admin
    getAdConfig,
    updateAdConfig,
    getAllPlacements,
    createPlacement,
    updatePlacement,
    deletePlacement,
    togglePlacementStatus,
    togglePlacementEnabled,
    getAdStats,
    getAdViewStats,
    // User-facing
    getAdForPosition,
    recordAdView,
    updateAdView,
    getUserAdsConfig,
    getActiveAds
};
