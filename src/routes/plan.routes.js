const planController = require('../controllers/plan.controller');

const planRoutes = async (fastify, options) => {
    fastify.get('/', planController.getPlans);
};

module.exports = planRoutes;
