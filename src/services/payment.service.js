const crypto = require('crypto');
const querystring = require('querystring');
const moment = require('moment'); // You might need to install moment or use vanilla Date
const { 
  VNPAY_TMN_CODE, 
  VNPAY_HASH_SECRET, 
  VNPAY_URL, 
  VNPAY_RETURN_URL 
} = require('../config/env');
const Transaction = require('../models/Transaction');
const PricingPlan = require('../models/PricingPlan');

const sortObject = (obj) => {
  let sorted = {};
  let str = [];
  let key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
  }
  return sorted;
};

const createPaymentUrl = async (req, userId, planId) => {
  const date = new Date();
  const createDate = moment(date).format('YYYYMMDDHHmmss');
  
  const ipAddr = req.headers['x-forwarded-for'] ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  // 1. Get Plan Details
  const plan = await PricingPlan.findById(planId);
  if (!plan) throw new Error('Invalid Pricing Plan');

  const amount = plan.price;
  const orderInfo = `Mua goi ${plan.name}`;
  
  const tmnCode = VNPAY_TMN_CODE;
  const secretKey = VNPAY_HASH_SECRET;
  let vnpUrl = VNPAY_URL;
  const returnUrl = VNPAY_RETURN_URL;
  
  const orderId = moment(date).format('DDHHmmss'); // Simplified order ID
  
  // 2. Create Transaction Pending
  await Transaction.create({
    user: userId,
    plan: planId,
    type: 'PREMIUM_SUBSCRIPTION',
    amount: amount,
    txnRef: orderId,
    status: 'PENDING'
  });

  let vnp_Params = {};
  vnp_Params['vnp_Version'] = '2.1.0';
  vnp_Params['vnp_Command'] = 'pay';
  vnp_Params['vnp_TmnCode'] = tmnCode;
  vnp_Params['vnp_Locale'] = 'vn';
  vnp_Params['vnp_CurrCode'] = 'VND';
  vnp_Params['vnp_TxnRef'] = orderId;
  vnp_Params['vnp_OrderInfo'] = orderInfo;
  vnp_Params['vnp_OrderType'] = 'other';
  vnp_Params['vnp_Amount'] = amount * 100;
  vnp_Params['vnp_ReturnUrl'] = returnUrl;
  vnp_Params['vnp_IpAddr'] = ipAddr;
  vnp_Params['vnp_CreateDate'] = createDate;

  vnp_Params = sortObject(vnp_Params);

  const signData = querystring.stringify(vnp_Params, { encode: false });
  const hmac = crypto.createHmac("sha512", secretKey);
  const signed = hmac.update(new Buffer(signData, 'utf-8')).digest("hex"); 
  vnp_Params['vnp_SecureHash'] = signed;
  
  vnpUrl += '?' + querystring.stringify(vnp_Params, { encode: false });

  return vnpUrl;
};

const verifyReturnUrl = (vnp_Params) => {
  let secureHash = vnp_Params['vnp_SecureHash'];
  delete vnp_Params['vnp_SecureHash'];
  delete vnp_Params['vnp_SecureHashType'];

  vnp_Params = sortObject(vnp_Params);

  const secretKey = VNPAY_HASH_SECRET;
  const signData = querystring.stringify(vnp_Params, { encode: false });
  const hmac = crypto.createHmac("sha512", secretKey);
  const signed = hmac.update(new Buffer(signData, 'utf-8')).digest("hex");

  return secureHash === signed;
};

const completeTransaction = async (txnRef, vnpayTransactionNo) => {
  const transaction = await Transaction.findOne({ txnRef }).populate('plan');
  if (!transaction) return false;
  
  if (transaction.status === 'COMPLETED') return true; // Already processed

  transaction.status = 'COMPLETED';
  transaction.vnpayTransactionNo = vnpayTransactionNo;
  transaction.completedAt = new Date();
  await transaction.save();

  // Activate Premium
  if (transaction.type === 'PREMIUM_SUBSCRIPTION' && transaction.plan) {
    const User = require('../models/User'); // Lazy load
    const user = await User.findById(transaction.user);
    
    // Add days to current expiry or now
    const now = new Date();
    const currentExpiry = user.premiumExpiry && user.premiumExpiry > now ? user.premiumExpiry : now;
    
    currentExpiry.setDate(currentExpiry.getDate() + transaction.plan.durationDays);
    
    user.isPremium = true;
    user.premiumExpiry = currentExpiry;
    await user.save();
  }

  return true;
};

module.exports = {
  createPaymentUrl,
  verifyReturnUrl,
  completeTransaction
};
