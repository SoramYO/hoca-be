const Badge = require('../models/Badge');

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
    updateBadge,
    deleteBadge
};
