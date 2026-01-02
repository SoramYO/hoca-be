const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: {
        type: String,
        enum: ['BADGE_UNLOCK', 'RANK_UP', 'STREAK_MILESTONE', 'SYSTEM', 'ROOM_INVITE'],
        required: true
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    icon: { type: String }, // URL to icon
    data: { type: mongoose.Schema.Types.Mixed }, // Extra data (badgeId, rankId, etc.)
    isRead: { type: Boolean, default: false, index: true }
}, { timestamps: true });

// Index for efficient queries
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
