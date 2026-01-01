const mongoose = require('mongoose');

const pricingPlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  price: { type: Number, required: true }, // VND
  tier: {
    type: String,
    enum: ['MONTHLY', 'YEARLY', 'LIFETIME'],
    required: true
  },
  durationDays: { type: Number, required: true }, // 30, 365, -1 for lifetime
  isActive: { type: Boolean, default: true },
  features: [String] // List of features for UI display
}, { timestamps: true });

module.exports = mongoose.model('PricingPlan', pricingPlanSchema);
