const mongoose = require('mongoose');

const motivationalQuoteSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['PROVERB', 'ENCOURAGEMENT', 'QUESTION'],
        default: 'ENCOURAGEMENT'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('MotivationalQuote', motivationalQuoteSchema);
