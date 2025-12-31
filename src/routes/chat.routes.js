const chatController = require('../controllers/chat.controller');
const { protect } = require('../middlewares/auth.middleware');

const chatRoutes = async (fastify, options) => {
    fastify.addHook('onRequest', protect);

    // Get messages for a room (all users can read)
    fastify.get('/:roomId', chatController.getMessages);

    // Send message (Pro only - checked in controller)
    fastify.post('/:roomId', chatController.sendMessage);
};

module.exports = chatRoutes;
