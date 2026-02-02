const Message = require('../models/Message');
const User = require('../models/User');

const sendMessage = async (req, reply) => {
    try {
        const { roomId } = req.params;
        const { content, type = 'TEXT', mentions = [], stickerId } = req.body;
        const userId = req.user.id;

        // Check if user is Premium (or Admin)
        const user = await User.findById(userId);
        const isAdmin = user.role === 'ADMIN';

        // Allow if Premium or Admin
        if (!user.isPremium && !isAdmin) {
            return reply.code(403).send({ message: 'Tính năng chat chỉ dành cho HOCA+ Tháng trở lên. Nâng cấp ngay!' });
        }

        // Validate content (required for TEXT/IMAGE, optional for STICKER if stickerId present)
        if (type === 'TEXT' && (!content || content.trim().length === 0)) {
            return reply.code(400).send({ message: 'Message content is required' });
        }

        if (type === 'STICKER' && !stickerId) {
            return reply.code(400).send({ message: 'Sticker ID is required' });
        }

        const messageData = {
            room: roomId,
            sender: userId,
            content: content ? content.trim() : (type === 'STICKER' ? '[Sticker]' : ''),
            type,
            mentions,
            stickerId
        };

        const message = await Message.create(messageData);

        // Populate sender info
        await message.populate('sender', 'displayName avatar');

        reply.code(201).send(message);
    } catch (error) {
        reply.code(400).send({ message: error.message });
    }
};

const getMessages = async (req, reply) => {
    try {
        const { roomId } = req.params;
        const { limit = 50, before } = req.query;

        const query = { room: roomId };
        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }

        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .populate('sender', 'displayName avatar');

        // Return in chronological order
        reply.send(messages.reverse());
    } catch (error) {
        reply.code(400).send({ message: error.message });
    }
};

module.exports = {
    sendMessage,
    getMessages
};
