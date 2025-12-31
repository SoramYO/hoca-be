const mongoose = require('mongoose');

const adConfigSchema = new mongoose.Schema({
    adFrequency: { type: Number, default: 15 }, // Minutes between ads
    maxAdsPerUser: { type: Number, default: 10 }, // Max ads per user per day
    vipExemption: { type: Boolean, default: true }, // Whether VIP users are exempt from ads
    isActive: { type: Boolean, default: true }, // Global ads toggle

    // Position-specific settings
    positions: {
        preRoom: {
            enabled: { type: Boolean, default: true },
            allowedTypes: [{ type: String, enum: ['image', 'video', 'embed'] }],
            defaultDuration: { type: Number, default: 5 } // seconds
        },
        banner: {
            enabled: { type: Boolean, default: true },
            allowedTypes: [{ type: String, enum: ['image', 'video', 'embed'] }],
            rotationInterval: { type: Number, default: 30 } // seconds
        },
        popup: {
            enabled: { type: Boolean, default: true },
            allowedTypes: [{ type: String, enum: ['image', 'video', 'embed'] }],
            // Trigger configuration
            triggers: {
                afterTime: { type: Boolean, default: true }, // Show popup after X minutes in app
                afterTimeMinutes: { type: Number, default: 5 }, // Minutes before first popup
                leaveRoom: { type: Boolean, default: false }, // Show popup when leaving room
                milestone: { type: Boolean, default: false } // Show popup on milestones (streaks, hours)
            },
            frequency: { type: Number, default: 300 }, // seconds between popups (if afterTime enabled)
            dismissable: { type: Boolean, default: true } // Can user close popup?
        }
    },

    // Streak recovery settings
    streakRecoveryEnabled: { type: Boolean, default: true },
    streakRecoveryAdDuration: { type: Number, default: 60 }, // seconds (1 minute)
    streakRecoverySourceType: { type: String, enum: ['video', 'script'], default: 'video' },
    streakRecoveryContent: { type: String, default: 'https://www.w3schools.com/html/mov_bbb.mp4' }, // URL
    streakRecoveryCooldownDays: { type: Number, default: 7 } // 1 per week
}, { timestamps: true });

// Singleton pattern - only one config document
adConfigSchema.statics.getConfig = async function () {
    let config = await this.findOne();
    if (!config) {
        config = await this.create({});
    }
    return config;
};

module.exports = mongoose.model('AdConfig', adConfigSchema);
