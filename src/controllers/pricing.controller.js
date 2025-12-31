const PricingPlan = require('../models/PricingPlan');

const createPlan = async (req, reply) => {
  try {
    const plan = await PricingPlan.create(req.body);
    reply.code(201).send(plan);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const getPlans = async (req, reply) => {
  try {
    // Admins see all, users check IsActive in frontend or query param?
    // Let's just return all for now, maybe filter in query
    const plans = await PricingPlan.find(req.query);
    reply.send(plans);
  } catch (error) {
    reply.code(500).send({ message: error.message });
  }
};

const updatePlan = async (req, reply) => {
  try {
    const plan = await PricingPlan.findByIdAndUpdate(req.params.id, req.body, { new: true });
    reply.send(plan);
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

const deletePlan = async (req, reply) => {
  try {
    await PricingPlan.findByIdAndDelete(req.params.id);
    reply.send({ message: 'Deleted' });
  } catch (error) {
    reply.code(400).send({ message: error.message });
  }
};

module.exports = {
  createPlan,
  getPlans,
  updatePlan,
  deletePlan
};
