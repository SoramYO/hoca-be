const mongoose = require('mongoose');

const adViewSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    adId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AdPlacement',
        required: true,
        index: true
    },
    position: { type: String }, // pre-room, banner, popup
    contentId: { type: mongoose.Schema.Types.ObjectId }, // Specific creative shown
    targetUrl: { type: String }, // Snapshot of destination link

    // Tracking data
    viewedAt: { type: Date, default: Date.now },
    duration: { type: Number, default: 0 }, // seconds watched
    completed: { type: Boolean, default: false }, // watched full ad?
    clicked: { type: Boolean, default: false },
    clickedAt: { type: Date },

    // Device info (optional)
    userAgent: { type: String },
    ipHash: { type: String } // hashed for privacy
}, { timestamps: true });

// Compound index for analytics
adViewSchema.index({ adId: 1, viewedAt: -1 });
adViewSchema.index({ userId: 1, viewedAt: -1 });

module.exports = mongoose.model('AdView', adViewSchema);
