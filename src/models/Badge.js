const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  icon: String, // URL to icon
  type: {
    type: String,
    enum: ['STREAK', 'STUDY_HOURS', 'TOP_LEARNER', 'TOP_STREAK'],
    required: true
  },
  threshold: { type: Number, required: true }, // e.g. 10 (days), 100 (hours)
  color: { type: String, default: 'from-blue-400 to-purple-500' } // Gradient class
}, { timestamps: true });

module.exports = mongoose.model('Badge', badgeSchema);
