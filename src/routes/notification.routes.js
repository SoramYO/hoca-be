const notificationController = require('../controllers/notification.controller');
const { protect } = require('../middlewares/auth.middleware');

const notificationRoutes = async (fastify, options) => {
    // All routes require authentication
    fastify.get('/', { preHandler: [protect] }, notificationController.getNotifications);
    fastify.get('/unread-count', { preHandler: [protect] }, notificationController.getUnreadCount);
    fastify.post('/mark-read', { preHandler: [protect] }, notificationController.markAsRead);
    fastify.delete('/old', { preHandler: [protect] }, notificationController.deleteOldNotifications);
};

module.exports = notificationRoutes;
