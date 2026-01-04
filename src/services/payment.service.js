const { PayOS } = require('@payos/node');
const moment = require('moment');
const {
  PAYOS_CLIENT_ID,
  PAYOS_API_KEY,
  PAYOS_CHECKSUM_KEY,
  CLIENT_URL
} = require('../config/env');
const Transaction = require('../models/Transaction');
const PricingPlan = require('../models/PricingPlan');
const User = require('../models/User');

const payOS = new PayOS(PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY);

const createPaymentUrl = async (req, userId, planId) => {
  // 1. Get Plan Details
  const plan = await PricingPlan.findById(planId);
  if (!plan) throw new Error('Invalid Pricing Plan');

  const amount = plan.price;
  const orderCode = Number(String(Date.now()).slice(-6)); // PayOS requires integer orderCode (max 9007199254740991), careful with collisions but simplified here
  // Better approach for orderCode: generate a random int or use a sequence. 
  // For safety let's use a random int below MAX_SAFE_INTEGER
  const safeOrderCode = Math.floor(Math.random() * 1000000000);

  // 2. Create Transaction Pending
  const transaction = await Transaction.create({
    user: userId,
    plan: planId,
    type: 'PREMIUM_SUBSCRIPTION',
    amount: amount,
    txnRef: String(safeOrderCode), // We store the PayOS orderCode as txnRef
    status: 'PENDING'
  });

  // 3. Create PayOS Payment Link
  const YOUR_DOMAIN = CLIENT_URL;
  const body = {
    orderCode: safeOrderCode,
    amount: amount,
    description: `Mua goi ${plan.name}`.slice(0, 25), // Description limited length
    items: [
      {
        name: plan.name,
        quantity: 1,
        price: amount
      }
    ],
    returnUrl: `${YOUR_DOMAIN}/payment/success`, // PayOS redirects here on success
    cancelUrl: `${YOUR_DOMAIN}/payment/failed`   // PayOS redirects here on cancel
  };

  try {
    const paymentLinkRes = await payOS.paymentRequests.create(body);
    return paymentLinkRes.checkoutUrl;
  } catch (error) {
    console.error("PayOS Create Error:", error);
    // If fail, maybe delete transaction? For now keep it as abandoned/pending
    throw new Error('Failed to create PayOS link');
  }
};

// Verify not strictly needed via URL params for PayOS if we trust their redirect or use Webhook.
// However, if we want to validte the return manually via an API call to PayOS (Double Check)
const verifyReturnUrl = async (query) => {
  // Basic implementation: We can just return true and let the frontend call completeTransaction
  // OR we can verify signatures if PayOS appends them to returnUrl (they usually do).
  // For simplicity with PayOS node SDK, we can getPaymentLinkInformation to verify status.
  return true;
};

// This function needs to be updated to check status against PayOS if via return URL
// OR just trust the call if we assume it comes from a secure flow (but better to verify).
const completeTransaction = async (txnRef, providerTransactionNo) => {
  const transaction = await Transaction.findOne({ txnRef }).populate('plan');
  if (!transaction) return false;

  if (transaction.status === 'COMPLETED') return true;

  // OPTIONAL: Verify with PayOS one last time
  try {
    const paymentLinkInfo = await payOS.paymentRequests.get(Number(txnRef));
    if (paymentLinkInfo.status !== 'PAID') {
      return false;
    }
  } catch (e) {
    console.error("PayOS Verify Error:", e);
    return false;
  }

  transaction.status = 'COMPLETED';
  transaction.vnpayTransactionNo = providerTransactionNo || 'PAYOS'; // Reuse field or add new
  transaction.completedAt = new Date();
  await transaction.save();

  // Activate Subscription
  if (transaction.type === 'PREMIUM_SUBSCRIPTION' && transaction.plan) {
    const user = await User.findById(transaction.user);

    const now = new Date();
    const plan = transaction.plan;

    user.subscriptionTier = plan.tier;
    user.subscriptionStartDate = now;

    if (plan.tier === 'LIFETIME') {
      user.subscriptionExpiry = null;
    } else {
      const currentExpiry = user.subscriptionExpiry && user.subscriptionExpiry > now
        ? new Date(user.subscriptionExpiry)
        : now;
      currentExpiry.setDate(currentExpiry.getDate() + plan.durationDays);
      user.subscriptionExpiry = currentExpiry;
    }

    await user.save();
  }

  return true;

};

const getUserTransactions = async (userId, page = 1, limit = 10) => {
  const skip = (page - 1) * limit;
  const transactions = await Transaction.find({ user: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('plan', 'name price currency durationDays');

  const total = await Transaction.countDocuments({ user: userId });

  return {
    transactions,
    total,
    page: Number(page),
    totalPages: Math.ceil(total / limit)
  };
};

module.exports = {
  createPaymentUrl,
  verifyReturnUrl,
  completeTransaction,
  getUserTransactions
};

