const Notification = require('../models/Notification');

/**
 * Get user's notifications (paginated)
 */
const getNotifications = async (req, reply) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({ user: userId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Notification.countDocuments({ user: userId });
        const unreadCount = await Notification.countDocuments({ user: userId, isRead: false });

        reply.send({
            notifications,
            unreadCount,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

/**
 * Get unread notification count
 */
const getUnreadCount = async (req, reply) => {
    try {
        const userId = req.user._id;
        const unreadCount = await Notification.countDocuments({ user: userId, isRead: false });
        reply.send({ unreadCount });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

/**
 * Mark notification(s) as read
 */
const markAsRead = async (req, reply) => {
    try {
        const userId = req.user._id;
        const { notificationIds } = req.body; // Array of IDs or 'all'

        if (notificationIds === 'all') {
            await Notification.updateMany(
                { user: userId, isRead: false },
                { isRead: true }
            );
        } else if (Array.isArray(notificationIds)) {
            await Notification.updateMany(
                { _id: { $in: notificationIds }, user: userId },
                { isRead: true }
            );
        }

        reply.send({ success: true });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

/**
 * Delete old notifications (older than 30 days)
 */
const deleteOldNotifications = async (req, reply) => {
    try {
        const userId = req.user._id;
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        const result = await Notification.deleteMany({
            user: userId,
            createdAt: { $lt: thirtyDaysAgo }
        });

        reply.send({ deleted: result.deletedCount });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

/**
 * Get admin notifications (blocked login attempts, etc.) - Admin only
 */
const getAdminNotifications = async (req, reply) => {
    try {
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;
        const type = req.query.type; // Optional filter by type

        const query = { user: userId, isAdminNotification: true };
        if (type) {
            query.type = type;
        }

        const notifications = await Notification.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await Notification.countDocuments(query);
        const unreadCount = await Notification.countDocuments({ ...query, isRead: false });

        reply.send({
            notifications,
            unreadCount,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

/**
 * Get admin unread notification count - Admin only
 */
const getAdminUnreadCount = async (req, reply) => {
    try {
        const userId = req.user._id;
        const unreadCount = await Notification.countDocuments({ 
            user: userId, 
            isAdminNotification: true,
            isRead: false 
        });
        reply.send({ unreadCount });
    } catch (error) {
        reply.code(500).send({ message: error.message });
    }
};

module.exports = {
    getNotifications,
    getUnreadCount,
    markAsRead,
    deleteOldNotifications,
    getAdminNotifications,
    getAdminUnreadCount
};
