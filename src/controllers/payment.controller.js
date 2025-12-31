const paymentService = require('../services/payment.service');
const User = require('../models/User');

const createPayment = async (req, reply) => {
  try {
    const { planId } = req.body; 
    // amount and orderInfo are now generated in service from planId
    const url = await paymentService.createPaymentUrl(req, req.user.id, planId);
    reply.send({ url });
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const vnpayReturn = async (req, reply) => {
  let vnp_Params = req.query;
  const secureHash = vnp_Params['vnp_SecureHash'];

  const isValid = paymentService.verifyReturnUrl(vnp_Params);

  if (isValid) {
    if (vnp_Params['vnp_ResponseCode'] === '00') {
      // Success
      await paymentService.completeTransaction(
        vnp_Params['vnp_TxnRef'], 
        vnp_Params['vnp_TransactionNo']
      );
      
      // Redirect to frontend
      reply.redirect(`${require('../config/env').CLIENT_URL}/payment/success`);
    } else {
      reply.redirect(`${require('../config/env').CLIENT_URL}/payment/failed`);
    }
  } else {
    reply.code(400).send({ code: '97', message: 'Checksum failed' });
  }
};

module.exports = {
  createPayment,
  vnpayReturn
};
