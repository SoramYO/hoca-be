const PricingPlan = require('../models/PricingPlan');

exports.getPlans = async (request, reply) => {
    try {
        const plans = await PricingPlan.find({ isActive: true }).sort({ price: 1 });
        reply.send(plans);
    } catch (error) {
        console.error('Get plans error:', error);
        reply.status(500).send({ message: 'Internal Server Error' });
    }
};
