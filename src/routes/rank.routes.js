const rankController = require('../controllers/rank.controller');
const { protect, admin } = require('../middlewares/auth.middleware');

const rankRoutes = async (fastify, options) => {
    // Public route to get ranks
    fastify.get('/', rankController.getRanks);

    // Admin routes
    fastify.put('/:level', { preHandler: [protect, admin] }, rankController.updateRank);
};

module.exports = rankRoutes;
