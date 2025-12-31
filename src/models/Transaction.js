const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  plan: { type: mongoose.Schema.Types.ObjectId, ref: 'PricingPlan' },
  
  type: { 
    type: String, 
    enum: ['PREMIUM_SUBSCRIPTION', 'STREAK_RECOVERY'],
    required: true 
  },
  
  amount: { type: Number, required: true },
  status: { 
    type: String, 
    enum: ['PENDING', 'COMPLETED', 'FAILED'], 
    default: 'PENDING' 
  },
  
  paymentMethod: { type: String, default: 'VNPAY' },
  txnRef: { type: String, unique: true }, // Order ID sent to VNPay
  vnpayTransactionNo: String, // Transaction No from VNPay
  
  completedAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
