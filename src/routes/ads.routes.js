const adsController = require('../controllers/ads.controller');
const { protect } = require('../middlewares/auth.middleware');

// User-facing ads routes
async function adsRoutes(fastify, options) {
    fastify.addHook('onRequest', protect);

    // Get ad for specific position (weighted random based on priority)
    fastify.get('/position/:position', adsController.getAdForPosition);

    // Record ad view start (returns viewId for tracking)
    fastify.post('/view/start', adsController.recordAdView);

    // Update ad view (duration, completed, clicked)
    fastify.put('/view/:viewId', adsController.updateAdView);

    // Get ads config for user (streak recovery, position settings)
    fastify.get('/config', adsController.getUserAdsConfig);

    // Get active ads list (legacy support)
    fastify.get('/active', adsController.getActiveAds);
}

module.exports = adsRoutes;
