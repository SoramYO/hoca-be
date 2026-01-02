const badgeController = require('../controllers/badge.controller');
const { protect, admin } = require('../middlewares/auth.middleware');

const badgeRoutes = async (fastify, options) => {
    // Public: Get all badges (for display)
    fastify.get('/', badgeController.getAllBadges);

    // User: Get badges with progress (requires auth)
    fastify.get('/me', { preHandler: [protect] }, badgeController.getUserBadges);

    // User: Manually check and unlock badges
    fastify.post('/check', { preHandler: [protect] }, badgeController.checkBadges);

    // Admin: Manage badges
    fastify.post('/', { preHandler: [protect, admin] }, badgeController.createBadge);
    fastify.put('/:id', { preHandler: [protect, admin] }, badgeController.updateBadge);
    fastify.delete('/:id', { preHandler: [protect, admin] }, badgeController.deleteBadge);
};

module.exports = badgeRoutes;

