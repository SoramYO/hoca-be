const adminController = require('../controllers/admin.controller');
const adsController = require('../controllers/ads.controller');
const { protect, admin } = require('../middlewares/auth.middleware');

const adminRoutes = async (fastify, options) => {
  fastify.addHook('onRequest', protect);
  fastify.addHook('onRequest', admin);

  // Users
  fastify.get('/users', adminController.getAllUsers);
  fastify.get('/users/:id', adminController.getUserDetails);
  fastify.put('/users/:id/block', adminController.toggleBlockUser);
  fastify.put('/users/:id/lock', adminController.toggleLockUser);

  // Dashboard Stats
  fastify.get('/stats', adminController.getSystemStats);

  // Rooms
  fastify.get('/rooms', adminController.getAllRooms);
  fastify.post('/rooms', adminController.createAdminRoom);
  fastify.get('/rooms/:id', adminController.getAdminRoomDetails); // New detail route
  fastify.post('/rooms/:id/close', adminController.closeRoom);

  // Room Categories
  fastify.get('/rooms/categories', adminController.getRoomCategories);
  fastify.post('/rooms/categories', adminController.createRoomCategory);
  fastify.put('/rooms/categories/:id', adminController.updateRoomCategory);
  fastify.delete('/rooms/categories/:id', adminController.deleteRoomCategory);

  // System Config
  fastify.get('/config', adminController.getSystemConfig);
  fastify.put('/config', adminController.updateSystemConfig);

  // Safety
  fastify.post('/users/:userId/warn', adminController.warnUser);

  // Revenue
  fastify.get('/revenue/stats', adminController.getRevenueStats);
  fastify.get('/revenue/transactions', adminController.getAllTransactions);

  // Analytics
  fastify.get('/analytics', adminController.getAnalytics);

  // Ads Management (Admin only)
  fastify.get('/ads/config', adsController.getAdConfig);
  fastify.put('/ads/config', adsController.updateAdConfig);
  fastify.get('/ads/stats', adsController.getAdStats);
  fastify.get('/ads/placements', adsController.getAllPlacements);
  fastify.post('/ads/placements', adsController.createPlacement);
  fastify.put('/ads/placements/:id', adsController.updatePlacement);
  fastify.delete('/ads/placements/:id', adsController.deletePlacement);
  fastify.post('/ads/placements/:id/toggle', adsController.togglePlacementStatus);
  fastify.post('/ads/placements/:id/toggle-enabled', adsController.togglePlacementEnabled);

  // Ad Views Analytics
  fastify.get('/ads/views', adsController.getAdViewStats);
};

module.exports = adminRoutes;

