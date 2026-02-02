const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, maxlength: 1000 }, // Increased limit for potential image URLs or long text
    type: {
        type: String,
        enum: ['TEXT', 'STICKER', 'IMAGE', 'SYSTEM'],
        default: 'TEXT'
    },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    stickerId: { type: String } // For referencing static stickers
}, { timestamps: true });

// Index for fetching recent messages
messageSchema.index({ room: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
