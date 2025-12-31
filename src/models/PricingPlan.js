const mongoose = require('mongoose');

const pricingPlanSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  price: { type: Number, required: true }, // VND
  durationDays: { type: Number, required: true }, // 30, 365, etc.
  isActive: { type: Boolean, default: true },
  features: [String] // List of features for UI display
}, { timestamps: true });

module.exports = mongoose.model('PricingPlan', pricingPlanSchema);
