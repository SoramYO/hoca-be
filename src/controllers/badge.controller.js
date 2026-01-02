const Badge = require('../models/Badge');
const { getUserBadgesWithProgress, checkAndUnlockBadges } = require('../services/badge.service');

const createBadge = async (req, reply) => {
    try {
        const { name, description, icon, type, threshold, color } = req.body;

        const existing = await Badge.findOne({ name });
        if (existing) {
            return reply.code(400).send({ message: 'Badge already exists' });
        }

        const badge = await Badge.create({
            name,
            description,
            icon,
            type,
            threshold,
            color
        });

        reply.code(201).send(badge);
    } catch (error) {
        reply.code(400).send({ message: error.message });
    }
};

const getAllBadges = async (req, reply) => {
    try {
        const badges = await Badge.find().sort({ threshold: 1 });
        reply.send(badges);
    } catch (error) {
        reply.code(400).send({ message: error.message });
    }
};

/**
 * Get all badges with user's progress and earned status
 */
const getUserBadges = async (req, reply) => {
    try {
        const userId = req.user._id;
        const result = await getUserBadgesWithProgress(userId);
        reply.send(result);
    } catch (error) {
        reply.code(400).send({ message: error.message });
    }
};

/**
 * Manually trigger badge check (useful for testing or after bulk updates)
 */
const checkBadges = async (req, reply) => {
    try {
        const userId = req.user._id;
        const io = req.server.io; // Get socket.io instance from server
        const result = await checkAndUnlockBadges(userId, io);
        reply.send(result);
    } catch (error) {
        reply.code(400).send({ message: error.message });
    }
};

const updateBadge = async (req, reply) => {
    try {
        const { id } = req.params;
        const badge = await Badge.findByIdAndUpdate(id, req.body, { new: true });
        if (!badge) {
            return reply.code(404).send({ message: 'Badge not found' });
        }
        reply.send(badge);
    } catch (error) {
        reply.code(400).send({ message: error.message });
    }
};

const deleteBadge = async (req, reply) => {
    try {
        const { id } = req.params;
        const badge = await Badge.findByIdAndDelete(id);
        if (!badge) {
            return reply.code(404).send({ message: 'Badge not found' });
        }
        reply.send({ message: 'Badge deleted' });
    } catch (error) {
        reply.code(400).send({ message: error.message });
    }
};

module.exports = {
    createBadge,
    getAllBadges,
    getUserBadges,
    checkBadges,
    updateBadge,
    deleteBadge
};

