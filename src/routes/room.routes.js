const roomController = require('../controllers/room.controller');
const { protect } = require('../middlewares/auth.middleware');

const roomRoutes = async (fastify, options) => {
  fastify.addHook('onRequest', protect);
  
  fastify.get('/', roomController.getRooms);
  fastify.post('/', roomController.createRoom);
  fastify.get('/:id', roomController.getRoom);
  fastify.post('/:id/join', roomController.joinRoom);
  fastify.post('/:id/leave', roomController.leaveRoom);
};

module.exports = roomRoutes;
