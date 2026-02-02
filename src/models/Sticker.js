const mongoose = require('mongoose');

const stickerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    url: {
        type: String,
        required: true
    },
    publicId: {
        type: String, // Cloudinary public_id for deletion
        required: true
    },
    isPremium: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Sticker', stickerSchema);
