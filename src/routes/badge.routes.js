const badgeController = require('../controllers/badge.controller');
const { protect, admin } = require('../middlewares/auth.middleware');

const badgeRoutes = async (fastify, options) => {
    // Public/User: Get all badges
    fastify.get('/', badgeController.getAllBadges);

    // Admin: Manage badges
    fastify.post('/', { preHandler: [protect, admin] }, badgeController.createBadge);
    fastify.put('/:id', { preHandler: [protect, admin] }, badgeController.updateBadge);
    fastify.delete('/:id', { preHandler: [protect, admin] }, badgeController.deleteBadge);
};

module.exports = badgeRoutes;
