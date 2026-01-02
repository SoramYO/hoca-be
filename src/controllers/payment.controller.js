const paymentService = require('../services/payment.service');

const createPayment = async (req, reply) => {
  try {
    const { planId } = req.body;
    const url = await paymentService.createPaymentUrl(req, req.user.id, planId);
    reply.send({ url });
  } catch (error) {
    console.error(error);
    reply.code(500).send({ message: error.message });
  }
};

// New endpoint: Frontend calls this after returning from PayOS to confirm status
const verifyPayment = async (req, reply) => {
  try {
    const { orderCode } = req.body; // or req.query
    if (!orderCode) {
      return reply.code(400).send({ message: 'Missing orderCode' });
    }

    const success = await paymentService.completeTransaction(String(orderCode));
    if (success) {
      reply.send({ success: true, message: 'Payment verified and subscription activated.' });
    } else {
      reply.code(400).send({ success: false, message: 'Payment verification failed or not paid.' });
    }
  } catch (error) {
    console.error(error);
    reply.code(500).send({ message: error.message });
  }
};

// Legacy/Unused for PayOS Direct-to-Frontend flow, but keeping if we switch strategy
const vnpayReturn = async (req, reply) => {
  // Not used in PayOS frontend-redirect flow
  reply.send({ message: "Legacy endpoint" });
};

module.exports = {
  createPayment,
  verifyPayment,
  vnpayReturn
};
