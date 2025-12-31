const Message = require('../models/Message');
const User = require('../models/User');

const sendMessage = async (req, reply) => {
    try {
        const { roomId } = req.params;
        const { content } = req.body;
        const userId = req.user.id;

        // Check if user is Premium
        const user = await User.findById(userId);
        if (!user.isPremium) {
            return reply.code(403).send({ message: 'Tính năng chat chỉ dành cho người dùng Pro. Nâng cấp ngay!' });
        }

        if (!content || content.trim().length === 0) {
            return reply.code(400).send({ message: 'Message content is required' });
        }

        const message = await Message.create({
            room: roomId,
            sender: userId,
            content: content.trim()
        });

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
