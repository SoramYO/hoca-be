const mongoose = require('mongoose');

/**
 * AI Usage Schema - Tracks daily AI question usage per user
 * FREE users: 5 questions/day
 * HOCA+ users: Unlimited
 */
const aiUsageSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: String, // Format: YYYY-MM-DD for easy daily tracking
        required: true
    },
    questionCount: {
        type: Number,
        default: 0
    },
    questions: [{
        question: String,
        response: String,
        model: String,
        tokensUsed: Number,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

// Compound index for efficient daily lookup
aiUsageSchema.index({ user: 1, date: 1 }, { unique: true });

// Static method to get or create today's usage record
aiUsageSchema.statics.getTodayUsage = async function (userId) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    let usage = await this.findOne({ user: userId, date: today });

    if (!usage) {
        usage = await this.create({
            user: userId,
            date: today,
            questionCount: 0,
            questions: []
        });
    }

    return usage;
};

// Static method to increment usage
aiUsageSchema.statics.incrementUsage = async function (userId, questionData) {
    const today = new Date().toISOString().split('T')[0];

    return await this.findOneAndUpdate(
        { user: userId, date: today },
        {
            $inc: { questionCount: 1 },
            $push: {
                questions: {
                    question: questionData.question?.substring(0, 500), // Limit stored question length
                    response: questionData.response?.substring(0, 1000), // Limit stored response length
                    model: questionData.model,
                    tokensUsed: questionData.tokensUsed || 0
                }
            }
        },
        { upsert: true, new: true }
    );
};

// Static method to check if user can ask (for FREE users)
aiUsageSchema.statics.canAsk = async function (userId, dailyLimit) {
    const usage = await this.getTodayUsage(userId);
    return usage.questionCount < dailyLimit;
};

const AIUsage = mongoose.model('AIUsage', aiUsageSchema);

module.exports = AIUsage;
