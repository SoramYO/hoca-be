const mongoose = require('mongoose');

const adPlacementSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },

    // ✅ THAY ĐỔI: Support nhiều Nội dung (Creatives) với weight riêng
    contents: [{
        type: {
            type: String,
            enum: ['image', 'video', 'embed'],
            default: 'image'
        },
        content: { type: String }, // URL for image/video
        embedCode: { type: String }, // HTML/iframe/script for embed type
        targetUrl: { type: String, required: true }, // Destination URL for this content
        priority: { type: Number, default: 5, min: 1, max: 10 }, // Priority để rotate content
        views: { type: Number, default: 0 },
        clicks: { type: Number, default: 0 }
    }],

    // ✅ THAY ĐỔI: Support nhiều vị trí với settings riêng
    positions: [{
        position: {
            type: String,
            enum: ['pre-room', 'banner', 'popup'],
            required: true
        },
        isEnabled: { type: Boolean, default: true },
        priority: { type: Number, default: 5, min: 1, max: 10 }, // Priority riêng cho từng vị trí
        duration: { type: Number, default: 5 }, // Duration riêng (seconds)
        views: { type: Number, default: 0 }, // Track views per position
        clicks: { type: Number, default: 0 } // Track clicks per position
    }],

    // Global settings
    status: { type: String, enum: ['Active', 'Paused', 'Scheduled'], default: 'Paused' },
    isEnabled: { type: Boolean, default: true },

    // Performance metrics (tổng hợp)
    totalViews: { type: Number, default: 0 },
    totalClicks: { type: Number, default: 0 },

    // Scheduling
    startDate: Date,
    endDate: Date,

    // Targeting (optional - nâng cao)
    targeting: {
        userTypes: [{ type: String, enum: ['free', 'vip', 'all'], default: 'all' }],
        countries: [String], // ['VN', 'US'] hoặc [] = all
        devices: [{ type: String, enum: ['mobile', 'desktop', 'tablet', 'all'], default: 'all' }]
    },

    // Pricing
    cpm: { type: Number, default: 0 }
}, { timestamps: true });

// ✅ Virtual for global CTR
adPlacementSchema.virtual('ctr').get(function () {
    if (this.totalViews === 0) return 0;
    return ((this.totalClicks / this.totalViews) * 100).toFixed(2);
});

// ✅ Method: Get weighted random CONTENT based on priority
adPlacementSchema.methods.getRandomContent = function () {
    if (!this.contents || this.contents.length === 0) return null;

    const totalWeight = this.contents.reduce((sum, item) => sum + item.priority, 0);
    let random = Math.random() * totalWeight;

    for (const item of this.contents) {
        random -= item.priority;
        if (random <= 0) return item;
    }

    return this.contents[0];
};

// ✅ Method: Get ads for specific position with priority
adPlacementSchema.statics.getAdsForPosition = async function (positionName) {
    const now = new Date();

    return this.find({
        isEnabled: true,
        status: 'Active',
        'positions.position': positionName,
        'positions.isEnabled': true,
        $or: [
            { startDate: { $lte: now }, endDate: { $gte: now } },
            { startDate: null, endDate: null }
        ]
    });
};

// ✅ Method: Track view for specific position and content
adPlacementSchema.methods.trackView = async function (positionName, contentId) {
    this.totalViews += 1;

    // Track by position
    const positionIndex = this.positions.findIndex(p => p.position === positionName);
    if (positionIndex !== -1) {
        this.positions[positionIndex].views += 1;
    }

    // Track by content
    if (contentId) {
        const contentIndex = this.contents.findIndex(c => c._id.toString() === contentId.toString());
        if (contentIndex !== -1) {
            this.contents[contentIndex].views += 1;
        }
    }

    await this.save();
};

// ✅ Method: Track click for specific position and content
adPlacementSchema.methods.trackClick = async function (positionName, contentId) {
    this.totalClicks += 1;

    // Track by position
    const positionIndex = this.positions.findIndex(p => p.position === positionName);
    if (positionIndex !== -1) {
        this.positions[positionIndex].clicks += 1;
    }

    // Track by content and return its targetUrl
    let targetUrl = null;
    if (contentId) {
        const contentIndex = this.contents.findIndex(c => c._id.toString() === contentId.toString());
        if (contentIndex !== -1) {
            this.contents[contentIndex].clicks += 1;
            targetUrl = this.contents[contentIndex].targetUrl;
        }
    }

    await this.save();
    return targetUrl; // Return the content's target URL
};

adPlacementSchema.set('toJSON', { virtuals: true });
adPlacementSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('AdPlacement', adPlacementSchema);