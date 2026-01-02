const mongoose = require('mongoose');

const rankSchema = new mongoose.Schema({
    level: { type: Number, required: true, unique: true, min: 0, max: 9 }, // 0 to 9
    name: { type: String, required: true },
    requiredHours: { type: Number, required: true },
    icon: { type: String, required: true }, // URL to icon
    color: { type: String, default: '' } // Optional color code
}, { timestamps: true });

// Ensure ascending order of levels
rankSchema.index({ level: 1 });

module.exports = mongoose.model('Rank', rankSchema);
